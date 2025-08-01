import { SchemaParser } from './schemaParser.js';
import { PromptBuilder } from './promptBuilder.js';
import { OpenRouterClient } from './apiClient.js';
import { Validator } from './validator.js';
import { UserPaths } from './userPaths.js';
import { CloudUserPaths } from './userManager.js';
import { createApiClient } from './sessionManager.js';
import { writeJsonFile, ensureDir } from './utils/fileIO.js';
import { AppError } from './utils/errors.js';
import * as console from './utils/console.js';
import fs from 'fs/promises';
import path from 'path';
import ora from 'ora';

export class DataGenerator {
  constructor(config, context = {}) {
    this.config = config;
    this.context = context;
    this.format = config.output?.format || 'json';
    this.onProgress = context.onProgress || null;

    if (this.format === 'json') {
      try {
        this.parser = new SchemaParser(config.schema);
        this.validator = new Validator(config.schema);
      } catch (error) {
        const schemaPath = this._findInvalidSchemaPath(error);
        const field = schemaPath || 'schema';
        throw new AppError(`Invalid JSON Schema at field '${field}': ${error.message}\n\nIn your configuration, check the property at: schema${schemaPath ? '.' + schemaPath : ''}\n\nJSON Schema types must be one of: string, number, integer, boolean, object, array, null\n\nTo allow any type, simply omit the 'type' field entirely.\n\nFor more information on configuration, see:\nhttps://github.com/diviatrix/llm-data-gen/blob/main/docs/configuration.md`, 'SCHEMA_ERROR');
      }
    }

    this.promptBuilder = new PromptBuilder(config);
    this.apiConfig = config.api;
    this.apiClient = null; // Will be initialized before use
    this.generatedCount = 0;
    this.errors = [];
    this.totalTokens = 0;
    this.totalCost = 0;
    this.verbose = config.verbose || false;
  }

  async _ensureApiClient() {
    if (!this.apiClient) {
      if (this.context.req) {
        // Web context - use session-aware client
        this.apiClient = await createApiClient(this.apiConfig || {}, this.context.req);
      } else {
        // CLI context - use standard client
        this.apiClient = new OpenRouterClient(this.apiConfig);
      }
    }
  }

  async generate(task) {
    const taskLabel = task.theme || task.topic || task.category || 'items';
    const spinner = ora(`Generating ${task.count} items for ${taskLabel}`).start();
    const results = [];

    try {
      for (let i = 0; i < task.count; i++) {
        spinner.text = `Generating item ${i + 1}/${task.count} for ${taskLabel}`;

        const context = this._buildContext(task, i);
        const item = await this._generateSingleItem(context);

        if (item) {
          results.push(item);
          this.generatedCount++;

          // Call progress callback if provided
          if (this.onProgress) {
            this.onProgress({
              current: this.generatedCount,
              total: this._getTotalCount(),
              currentItem: taskLabel
            });
          }
        }

        if (i < task.count - 1) {
          await this._delay(this.config.api.batchDelay || 1000);
        }
      }

      spinner.succeed(`Generated ${results.length} items for ${taskLabel}`);
      return results;
    } catch (error) {
      spinner.fail(`Failed to generate items for ${taskLabel}: ${error.message}`);
      this.errors.push({ task, error: error.message });
      return results;
    }
  }

  async generateAll() {
    if (!this.config.generation?.tasks) {
      throw new AppError('No generation tasks defined in config', 'CONFIG_ERROR');
    }

    const allResults = {};
    const startTime = Date.now();

    console.info(`\nStarting generation of ${this.config.generation.tasks.length} tasks...\n`);

    for (const task of this.config.generation.tasks) {
      const results = await this.generate(task);

      if (results.length > 0) {
        const key = this._getTaskKey(task);
        if (!allResults[key]) {
          allResults[key] = [];
        }
        allResults[key].push(...results);

        await this._saveResults(key, allResults[key], task);
      }
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    this._printSummary(duration);

    return allResults;
  }

  async _generateSingleItem(context) {
    try {
      await this._ensureApiClient();
      const systemPrompt = this.promptBuilder.buildSystemPrompt();

      let userPrompt;
      if (this.format === 'text') {
        const template = this.config.prompts?.userPrompt ||
                        `Generate content based on the following context: ${JSON.stringify(context)}`;
        userPrompt = this.promptBuilder._resolveTemplate(template, context);
      } else {
        userPrompt = this.promptBuilder.buildStructurePrompt(this.config.schema, context);
      }

      const result = await this.apiClient.generateJSON(systemPrompt, userPrompt, {
        verbose: this.verbose,
        format: this.format
      });

      let generatedData;
      let usage = null;

      if (this.verbose && result.data) {
        generatedData = result.data;
        usage = result.usage;

        if (usage) {
          const totalTokens = (usage.prompt_tokens || 0) + (usage.completion_tokens || 0);
          this.totalTokens += totalTokens;

          const modelPrice = await this._getModelPrice(result.model || this.config.api?.model);
          if (modelPrice > 0) {
            const cost = (totalTokens / 1000000) * modelPrice;
            this.totalCost += cost;
          }

          const costStr = modelPrice > 0
            ? console.cost((totalTokens / 1000000) * modelPrice)
            : 'Free';

          const previewStr = JSON.stringify(generatedData);
          const preview = previewStr.length > 80
            ? previewStr.substring(0, 80) + '...'
            : previewStr;

          const modelInfo = (this.config.api?.model === 'openrouter/auto' && result.model)
            ? ` [${result.model}]`
            : '';

          console.debug(`  📊 ${usage.prompt_tokens || 0}→${usage.completion_tokens || 0} tokens (${totalTokens} total)${modelInfo} • ${costStr} • Preview: ${preview}`);
        }
      } else {
        generatedData = result;
      }

      if (this.format === 'text') {
        return generatedData;
      }

      const processedResult = this._processGeneratedData(generatedData, context);

      const validation = this.validator.validate(processedResult);
      if (!validation.valid) {
        throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
      }

      return processedResult;
    } catch (error) {
      this.errors.push({ context, error: error.message });
      console.error(`Error generating item: ${error.message}`);
      return null;
    }
  }

  _processGeneratedData(data, context) {
    const fields = this.parser.parse();

    const process = (obj, path = '') => {
      if (Array.isArray(obj)) {
        return obj.map((item, index) => process(item, `${path}[${index}]`));
      }

      if (obj && typeof obj === 'object') {
        const processed = {};

        for (const [key, value] of Object.entries(obj)) {
          const currentPath = path ? `${path}.${key}` : key;
          const field = fields.find(f => f.path === currentPath);

          if (field?.generateConfig?.template) {
            processed[key] = this.promptBuilder._resolveTemplate(
              field.generateConfig.template,
              { ...context, ...obj, index: context.index }
            );
          } else if (field?.generateConfig?.value) {
            processed[key] = this.promptBuilder._resolveTemplate(
              field.generateConfig.value,
              context
            );
          } else if (field?.generateConfig?.mapping && field.generateConfig.mapping[value]) {
            processed[key] = field.generateConfig.mapping[value];
          } else {
            processed[key] = process(value, currentPath);
          }
        }

        return processed;
      }

      return obj;
    };

    return process(data);
  }

  _buildContext(task, index) {
    const context = {
      ...task,
      index: index
    };

    const now = new Date();
    context.date = now.toISOString().split('T')[0];
    context.datetime = now.toISOString();
    context.now = now.toISOString(); // Alias for datetime
    context.timestamp = now.getTime();

    if (task.theme) {
      context.theme_translit = this.promptBuilder._transliterate(task.theme);
    }
    if (task.topic) {
      context.topic_translit = this.promptBuilder._transliterate(task.topic);
    }
    if (task.category) {
      context.category_translit = this.promptBuilder._transliterate(task.category);
    }

    if (task.difficulty) {
      context.difficulty_num = task.difficulty === 'easy' ? 1 : task.difficulty === 'medium' ? 2 : 3;
    }

    if (task.answers) {
      context.answers_minus_1 = task.answers - 1;
    }

    // Add _minus_1 and _plus_1 for all numeric fields
    for (const [key, value] of Object.entries(task)) {
      if (typeof value === 'number') {
        context[`${key}_minus_1`] = value - 1;
        context[`${key}_plus_1`] = value + 1;
      }
    }

    return context;
  }

  async _saveResults(key, results, task) {
    if (!this.config.output?.outputPath) {
      return;
    }

    let outputPath;
    if (this.context.req) {
      // Use web-specific paths for cloud/local network users
      const paths = CloudUserPaths.getPathsForRequest(this.context.req);
      outputPath = paths.resolveOutputPath(this.config.output.outputPath);
    } else {
      // Use standard paths for CLI
      outputPath = UserPaths.resolveOutputPath(this.config.output.outputPath);
    }
    await ensureDir(outputPath);

    const fileExtension = this.format === 'text'
      ? (this.config.output?.fileExtension || '.txt')
      : '.json';

    const fileName = this.config.output.fileNameTemplate
      ? this.promptBuilder._resolveTemplate(this.config.output.fileNameTemplate, {
        ...task,
        theme_translit: this.promptBuilder._transliterate(task.theme),
        topic_translit: this.promptBuilder._transliterate(task.topic),
        key: key,
        date: new Date().toISOString().split('T')[0] // Add current date
      })
      : `${key}${fileExtension}`;

    const filePath = path.join(outputPath, fileName);

    if (this.format === 'text') {
      // For text format, handle multiple results differently
      if (Array.isArray(results) && results.length > 1) {
        // Save each result to a separate file
        for (let i = 0; i < results.length; i++) {
          const indexedFileName = fileName.replace('{index}', i + 1);
          const indexedFilePath = path.join(outputPath, indexedFileName);
          await fs.writeFile(indexedFilePath, results[i]);
          console.success(`Saved text content to ${indexedFilePath}`);
        }
      } else {
        // Single result or non-array
        const content = Array.isArray(results) ? results[0] : results;
        const singleFileName = fileName.replace('{index}', '1');
        const singleFilePath = path.join(outputPath, singleFileName);
        await fs.writeFile(singleFilePath, content);
        console.success(`Saved text content to ${singleFilePath}`);
      }
    } else {
      // For JSON format, use existing logic
      const outputData = this.config.output.type === 'array'
        ? results
        : { [key]: results };

      await writeJsonFile(filePath, outputData);
      console.success(`Saved ${results.length} items to ${filePath}`);
    }
  }

  _getTaskKey(task) {
    // Use theme, topic, or category for the key
    const label = task.theme || task.topic || task.category || 'data';
    const transliterated = this.promptBuilder._transliterate(label);
    const suffix = task.difficulty || task.type || 'default';
    return `${transliterated}_${suffix}`;
  }

  _getTotalCount() {
    if (!this.config.generation?.tasks) return 0;
    return this.config.generation.tasks.reduce((sum, task) => sum + (task.count || 1), 0);
  }

  _printSummary(duration) {
    console.info('\n' + '='.repeat(50));
    console.section('Generation Summary', '📊');
    console.success(`Total items generated: ${this.generatedCount}`);
    console.info(`Time taken: ${duration}s`, '⏱');

    // Always show token and cost info if available
    if (this.totalTokens > 0) {
      console.info(`Total tokens used: ${this.totalTokens.toLocaleString()}`, '🔤');

      const avgTokens = Math.round(this.totalTokens / Math.max(this.generatedCount, 1));
      console.debug(`Average tokens/item: ${avgTokens.toLocaleString()}`);
    }

    if (this.totalCost > 0) {
      console.info(`Total cost: ${console.cost(this.totalCost)}`, '💰');

      const avgCost = this.totalCost / Math.max(this.generatedCount, 1);
      console.debug(`Average cost/item: ${console.cost(avgCost)}`);
    }

    if (this.errors.length > 0) {
      console.error(`Errors encountered: ${this.errors.length}`, '✗');
      console.error('\nErrors:');

      // Group and format validation errors
      const formattedErrors = this._formatErrors(this.errors);
      formattedErrors.slice(0, 10).forEach((err, i) => {
        console.info(`  ${i + 1}. ${err}`);
      });
      if (formattedErrors.length > 10) {
        console.info(`  ... and ${formattedErrors.length - 10} more`);
      }
    }

    console.info('\n' + '='.repeat(50) + '\n');
  }

  _formatErrors(errors) {
    const formatted = [];

    errors.forEach(err => {
      const errorMsg = err.error;

      // Check if it's a validation error with multiple items
      if (errorMsg.startsWith('Validation failed:')) {
        // Extract validation messages
        const validationPart = errorMsg.substring('Validation failed: '.length);

        // Parse validation errors - they usually come as "items[0].field: message, items[1].field: message"
        const itemErrors = validationPart.split(', ').reduce((acc, curr) => {
          const match = curr.match(/items\[(\d+)\]\.([^:]+): (.+)/);
          if (match) {
            const [, index, field, message] = match;
            const key = `${field}: ${message}`;
            if (!acc[key]) acc[key] = [];
            acc[key].push(parseInt(index));
          } else {
            // Non-item validation error
            formatted.push(curr);
          }
          return acc;
        }, {});

        // Format grouped errors
        Object.entries(itemErrors).forEach(([error, indices]) => {
          if (indices.length > 3) {
            formatted.push(`${error} (items: ${indices.slice(0, 3).join(', ')}, ... and ${indices.length - 3} more)`);
          } else {
            formatted.push(`${error} (items: ${indices.join(', ')})`);
          }
        });
      } else {
        // Other types of errors
        formatted.push(errorMsg);
      }
    });

    return formatted;
  }

  async _getModelPrice(modelId) {
    try {
      const models = await this.apiClient.getModels();
      const model = models.find(m => m.id === modelId);

      if (model?.pricing?.prompt) {
        // OpenRouter API uses pricing.prompt for price per token
        return parseFloat(model.pricing.prompt) * 1000000;
      }

      return 0;
    } catch (error) {
      return 0;
    }
  }

  _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  _findInvalidSchemaPath(error) {
    // Try to extract the path from AJV error message
    // Example: "data/properties/newslist/type must be equal to one of the allowed values"
    const match = error.message.match(/data\/properties\/([^/\s]+)(?:\/([^/\s]+))?/);
    if (match) {
      return match[2] ? `properties.${match[1]}.${match[2]}` : `properties.${match[1]}`;
    }

    // Try to extract from instancePath if available
    if (error.instancePath) {
      return error.instancePath.replace(/^\//, '').replace(/\//g, '.');
    }

    return null;
  }

  async validateExisting(filePath) {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const data = JSON.parse(content);

      const results = [];
      const items = Array.isArray(data) ? data : [data];

      for (const item of items) {
        const validation = this.validator.validate(item);
        results.push({
          item: item.id || item.name || 'unnamed',
          valid: validation.valid,
          errors: validation.errors
        });
      }

      return results;
    } catch (error) {
      throw new Error(`Failed to validate file: ${error.message}`);
    }
  }
}

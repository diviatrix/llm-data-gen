import { SchemaParser } from './schemaParser.js';
import { PromptBuilder } from './promptBuilder.js';
import { OpenRouterClient } from './apiClient.js';
import { Validator } from './validator.js';
import fs from 'fs/promises';
import path from 'path';
import ora from 'ora';
import chalk from 'chalk';

export class DataGenerator {
  constructor(config) {
    this.config = config;
    this.format = config.output?.format || 'json';
    
    // Only initialize schema-related tools for JSON format
    if (this.format === 'json') {
      this.parser = new SchemaParser(config.schema);
      this.validator = new Validator(config.schema);
    }
    
    this.promptBuilder = new PromptBuilder(config);
    this.apiClient = new OpenRouterClient(config.api);
    this.generatedCount = 0;
    this.errors = [];
    this.totalTokens = 0;
    this.totalCost = 0;
    this.verbose = config.verbose || false;
  }

  async generate(task) {
    // Get descriptive label for the task (theme, topic, category, etc.)
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
      throw new Error('No generation tasks defined in config');
    }

    const allResults = {};
    const startTime = Date.now();
    
    console.log(chalk.blue(`\nStarting generation of ${this.config.generation.tasks.length} tasks...\n`));
    
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
      const systemPrompt = this.promptBuilder.buildSystemPrompt();
      
      let userPrompt;
      if (this.format === 'text') {
        // For text format, resolve template variables in user prompt
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
        
        // Calculate cost if we have pricing info
        if (usage) {
          const totalTokens = (usage.prompt_tokens || 0) + (usage.completion_tokens || 0);
          this.totalTokens += totalTokens;
          
          // Get model price
          const modelPrice = await this._getModelPrice(result.model || this.config.api?.model);
          if (modelPrice > 0) {
            const cost = (totalTokens / 1000000) * modelPrice;
            this.totalCost += cost;
          }
          
          // Display verbose info in compact format
          const costStr = modelPrice > 0 
            ? `$${((totalTokens / 1000000) * modelPrice).toFixed(4)}` 
            : 'Free';
          
          // Create compact preview (single line)
          const previewStr = JSON.stringify(generatedData);
          const preview = previewStr.length > 80 
            ? previewStr.substring(0, 80) + '...' 
            : previewStr;
          
          // Show actual model used if Auto Router was selected
          const modelInfo = (this.config.api?.model === 'openrouter/auto' && result.model) 
            ? ` [${result.model}]` 
            : '';
          
          console.log(chalk.gray(`  📊 ${usage.prompt_tokens || 0}→${usage.completion_tokens || 0} tokens (${totalTokens} total)${modelInfo} • ${costStr} • Preview: ${preview}`));
        }
      } else {
        generatedData = result;
      }
      
      // Skip validation and processing for text format
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
      console.error(chalk.red(`\nError generating item: ${error.message}`));
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
    
    // Add current date
    const now = new Date();
    context.date = now.toISOString().split('T')[0]; // YYYY-MM-DD format
    context.datetime = now.toISOString();
    context.timestamp = now.getTime();
    
    // Add transliteration for common fields if they exist
    if (task.theme) {
      context.theme_translit = this.promptBuilder._transliterate(task.theme);
    }
    if (task.topic) {
      context.topic_translit = this.promptBuilder._transliterate(task.topic);
    }
    if (task.category) {
      context.category_translit = this.promptBuilder._transliterate(task.category);
    }
    
    // Add difficulty number if difficulty exists
    if (task.difficulty) {
      context.difficulty_num = task.difficulty === 'easy' ? 1 : task.difficulty === 'medium' ? 2 : 3;
    }
    
    // Add special fields for answers if exists
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
    
    const outputPath = this.config.output.outputPath;
    await fs.mkdir(outputPath, { recursive: true });
    
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
          console.log(chalk.green(`✓ Saved text content to ${indexedFilePath}`));
        }
      } else {
        // Single result or non-array
        const content = Array.isArray(results) ? results[0] : results;
        const singleFileName = fileName.replace('{index}', '1');
        const singleFilePath = path.join(outputPath, singleFileName);
        await fs.writeFile(singleFilePath, content);
        console.log(chalk.green(`✓ Saved text content to ${singleFilePath}`));
      }
    } else {
      // For JSON format, use existing logic
      const outputData = this.config.output.type === 'array' 
        ? results 
        : { [key]: results };
      
      await fs.writeFile(filePath, JSON.stringify(outputData, null, 2));
      console.log(chalk.green(`✓ Saved ${results.length} items to ${filePath}`));
    }
  }

  _getTaskKey(task) {
    // Use theme, topic, or category for the key
    const label = task.theme || task.topic || task.category || 'data';
    const transliterated = this.promptBuilder._transliterate(label);
    const suffix = task.difficulty || task.type || 'default';
    return `${transliterated}_${suffix}`;
  }

  _printSummary(duration) {
    console.log('\n' + chalk.blue('='.repeat(50)));
    console.log(chalk.bold('\n📊 Generation Summary:\n'));
    console.log(`${chalk.green('✓')} Total items generated: ${chalk.bold(this.generatedCount)}`);
    console.log(`${chalk.yellow('⏱')} Time taken: ${chalk.bold(duration + 's')}`);
    
    if (this.verbose && this.totalTokens > 0) {
      console.log(`${chalk.cyan('🔤')} Total tokens used: ${chalk.bold(this.totalTokens.toLocaleString())}`);
      if (this.totalCost > 0) {
        console.log(`${chalk.yellow('💰')} Total cost: ${chalk.bold('$' + this.totalCost.toFixed(4))}`);
      }
    }
    
    if (this.errors.length > 0) {
      console.log(`${chalk.red('✗')} Errors encountered: ${chalk.bold(this.errors.length)}`);
      console.log(chalk.red('\nErrors:'));
      this.errors.slice(0, 5).forEach((err, i) => {
        console.log(`  ${i + 1}. ${err.error}`);
      });
      if (this.errors.length > 5) {
        console.log(`  ... and ${this.errors.length - 5} more`);
      }
    }
    
    console.log('\n' + chalk.blue('='.repeat(50)) + '\n');
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

  async validateExisting(filePath) {
    try {
      const content = await fs.readFile(filePath, 'utf-8');
      const data = JSON.parse(content);
      
      const results = [];
      const items = Array.isArray(data) ? data : Object.values(data).flat();
      
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
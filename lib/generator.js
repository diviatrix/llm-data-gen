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
    this.parser = new SchemaParser(config.schema);
    this.promptBuilder = new PromptBuilder(config);
    this.apiClient = new OpenRouterClient(config.api);
    this.validator = new Validator(config.schema);
    this.generatedCount = 0;
    this.errors = [];
  }

  async generate(task) {
    const spinner = ora(`Generating ${task.count} items for ${task.theme}`).start();
    const results = [];
    
    try {
      for (let i = 0; i < task.count; i++) {
        spinner.text = `Generating item ${i + 1}/${task.count} for ${task.theme}`;
        
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
      
      spinner.succeed(`Generated ${results.length} items for ${task.theme}`);
      return results;
    } catch (error) {
      spinner.fail(`Failed to generate items for ${task.theme}: ${error.message}`);
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
      const structurePrompt = this.promptBuilder.buildStructurePrompt(this.config.schema, context);
      
      const result = await this.apiClient.generateJSON(systemPrompt, structurePrompt);
      
      const processedResult = this._processGeneratedData(result, context);
      
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
      index: index,
      theme_translit: this.promptBuilder._transliterate(task.theme),
      difficulty_num: task.difficulty === 'easy' ? 1 : task.difficulty === 'medium' ? 2 : 3,
      answers_minus_1: (task.answers || 4) - 1
    };
    
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
    
    const fileName = this.config.output.fileNameTemplate
      ? this.promptBuilder._resolveTemplate(this.config.output.fileNameTemplate, {
          ...task,
          theme_translit: this.promptBuilder._transliterate(task.theme),
          key: key
        })
      : `${key}.json`;
    
    const filePath = path.join(outputPath, fileName);
    
    const outputData = this.config.output.type === 'array' 
      ? results 
      : { [key]: results };
    
    await fs.writeFile(filePath, JSON.stringify(outputData, null, 2));
    console.log(chalk.green(`✓ Saved ${results.length} items to ${filePath}`));
  }

  _getTaskKey(task) {
    return `${this.promptBuilder._transliterate(task.theme)}_${task.difficulty || 'default'}`;
  }

  _printSummary(duration) {
    console.log('\n' + chalk.blue('='.repeat(50)));
    console.log(chalk.bold('\n📊 Generation Summary:\n'));
    console.log(`${chalk.green('✓')} Total items generated: ${chalk.bold(this.generatedCount)}`);
    console.log(`${chalk.yellow('⏱')} Time taken: ${chalk.bold(duration + 's')}`);
    
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
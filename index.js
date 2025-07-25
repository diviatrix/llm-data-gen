#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import fs from 'fs/promises';
import path from 'path';
import { ConfigManager } from './lib/configManager.js';
import { DataGenerator } from './lib/generator.js';
import { OpenRouterClient } from './lib/apiClient.js';

const program = new Command();

program
  .name('llm-data-gen')
  .description('Universal JSON data generator using LLM')
  .version('1.0.0');

program
  .command('generate', { isDefault: true })
  .description('Generate data using configuration')
  .option('-c, --config <path>', 'Path to configuration file')
  .option('-m, --model <model>', 'Override model from config')
  .option('-t, --temperature <value>', 'Override temperature (0-2)')
  .option('-o, --output <path>', 'Override output path')
  .option('--count <number>', 'Override count for first task')
  .option('--max-tokens <number>', 'Override max tokens')
  .action(async (options) => {
    try {
      const configManager = new ConfigManager();
      
      let config;
      if (options.config) {
        config = await configManager.loadConfig(options.config);
      } else {
        const examples = await configManager.listExamples();
        if (examples.includes('quiz.json')) {
          console.log(chalk.blue('Using example quiz.json configuration'));
          config = await configManager.loadExample('quiz.json');
        } else {
          config = await configManager.loadDefaultConfig();
        }
      }
      
      config = configManager.applyCliOptions(config, options);
      
      console.log(chalk.bold('\n📋 Configuration:'));
      const info = configManager.getConfigInfo(config);
      Object.entries(info).forEach(([key, value]) => {
        console.log(`  ${chalk.gray(key)}: ${chalk.white(value)}`);
      });
      
      const generator = new DataGenerator(config);
      await generator.generateAll();
      
    } catch (error) {
      console.error(chalk.red(`\n❌ Error: ${error.message}`));
      process.exit(1);
    }
  });

program
  .command('validate <file>')
  .description('Validate existing JSON file against schema')
  .option('-s, --schema <path>', 'Path to schema file or config with schema')
  .action(async (file, options) => {
    try {
      const configManager = new ConfigManager();
      
      let schema;
      if (options.schema) {
        const schemaContent = await fs.readFile(options.schema, 'utf-8');
        const parsed = JSON.parse(schemaContent);
        schema = parsed.schema || parsed;
      } else {
        console.error(chalk.red('Schema is required for validation'));
        process.exit(1);
      }
      
      const config = {
        schema,
        api: {},
        prompts: {}
      };
      
      const generator = new DataGenerator(config);
      const results = await generator.validateExisting(file);
      
      const valid = results.filter(r => r.valid);
      const invalid = results.filter(r => !r.valid);
      
      console.log(chalk.bold('\n📊 Validation Results:'));
      console.log(`  ${chalk.green('✓ Valid')}: ${valid.length}`);
      console.log(`  ${chalk.red('✗ Invalid')}: ${invalid.length}`);
      
      if (invalid.length > 0) {
        console.log(chalk.red('\nInvalid items:'));
        invalid.slice(0, 10).forEach(item => {
          console.log(`  - ${item.item}: ${item.errors.join(', ')}`);
        });
        if (invalid.length > 10) {
          console.log(`  ... and ${invalid.length - 10} more`);
        }
      }
      
    } catch (error) {
      console.error(chalk.red(`\n❌ Error: ${error.message}`));
      process.exit(1);
    }
  });

program
  .command('test-connection')
  .description('Test connection to OpenRouter API')
  .option('-k, --api-key <key>', 'API key (or use OPENROUTER_API_KEY env)')
  .action(async (options) => {
    try {
      const spinner = ora('Testing connection to OpenRouter...').start();
      
      const client = new OpenRouterClient({
        apiKey: options.apiKey
      });
      
      const result = await client.testConnection();
      
      if (result.connected) {
        spinner.succeed('Connected to OpenRouter successfully!');
        console.log(chalk.green(`\n✓ Available models: ${result.models.length}`));
        console.log('Some popular models:');
        const popular = result.models.filter(m => 
          m.includes('gpt') || m.includes('claude') || m.includes('deepseek')
        ).slice(0, 10);
        popular.forEach(m => console.log(`  - ${m}`));
      } else {
        spinner.fail('Failed to connect to OpenRouter');
        console.error(chalk.red(`Error: ${result.error}`));
      }
      
    } catch (error) {
      console.error(chalk.red(`\n❌ Error: ${error.message}`));
      process.exit(1);
    }
  });

program
  .command('create-config <type>')
  .description('Create example configuration file')
  .option('-o, --output <path>', 'Output path', './config.json')
  .action(async (type, options) => {
    try {
      const configManager = new ConfigManager();
      const config = await configManager.createExampleConfig(type);
      
      await configManager.saveConfig(config, options.output);
      console.log(chalk.green(`✓ Created ${type} config at ${options.output}`));
      
    } catch (error) {
      console.error(chalk.red(`\n❌ Error: ${error.message}`));
      process.exit(1);
    }
  });

program
  .command('list-examples')
  .description('List available example configurations')
  .action(async () => {
    try {
      const configManager = new ConfigManager();
      const examples = await configManager.listExamples();
      
      if (examples.length === 0) {
        console.log(chalk.yellow('No example configurations found'));
        return;
      }
      
      console.log(chalk.bold('\n📁 Available examples:'));
      for (const example of examples) {
        try {
          const config = await configManager.loadExample(example);
          const info = configManager.getConfigInfo(config);
          console.log(`\n  ${chalk.blue(example)}`);
          console.log(`    Name: ${info.name}`);
          console.log(`    Properties: ${info.propertiesCount}`);
          console.log(`    Tasks: ${info.tasksCount}`);
        } catch (err) {
          console.log(`  ${chalk.gray(example)} (error loading)`);
        }
      }
      
    } catch (error) {
      console.error(chalk.red(`\n❌ Error: ${error.message}`));
      process.exit(1);
    }
  });

console.log(chalk.blue.bold(`
╔═══════════════════════════════════╗
║     LLM Data Generator v1.0.0     ║
╚═══════════════════════════════════╝
`));

program.parse(process.argv);
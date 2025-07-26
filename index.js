#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import inquirer from 'inquirer';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { ConfigManager } from './lib/configManager.js';
import { DataGenerator } from './lib/generator.js';
import { createApiClient } from './lib/sessionManager.js';
import { selectModel } from './lib/cli/modelSelector.js';
import { selectConfig, configureParameters, setupManualConfig } from './lib/cli/configWizard.js';
import { testConnection, validateFile, createConfig, listExamples } from './lib/cli/commands.js';
import { displayAccountInfo, getModelPrice, calculateEstimatedCost } from './lib/cli/uiHelpers.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read package.json for metadata
const packageJson = JSON.parse(
  await fs.readFile(path.join(__dirname, 'package.json'), 'utf-8')
);

const program = new Command();

// Helper function to update model in config
function updateConfigModel(config, model) {
  if (!config.api) config.api = {};
  config.api.model = model;
}

// Helper function to handle model selection
async function handleModelSelection(config, currentModel) {
  const selectedModel = await selectModel(currentModel);
  if (selectedModel === null) {
    console.log(chalk.gray('\nCancelled model selection.'));
    return null;
  }
  updateConfigModel(config, selectedModel);
  return selectedModel;
}

// Helper function to display configuration
async function displayConfiguration(config, configManager) {
  const client = await createApiClient(config.api);
  const userInfo = await client.getUserInfo();
  
  displayAccountInfo(userInfo);
  
  console.log(chalk.bold('\n📋 Configuration:'));
  const info = configManager.getConfigInfo(config);
  
  console.log(`  ${chalk.gray('name')}: ${chalk.white(info.name)}`);
  console.log(`  ${chalk.gray('version')}: ${chalk.white(info.version)}`);
  console.log(`  ${chalk.gray('model')}: ${chalk.white(info.model)}`);
  console.log(`  ${chalk.gray('temperature')}: ${chalk.white(info.temperature)}`);
  console.log(`  ${chalk.gray('max tokens')}: ${chalk.white(info.maxTokens)}`);
  console.log(`  ${chalk.gray('output path')}: ${chalk.white(info.outputPath)}`);
  
  const modelId = config.api?.model || 'openrouter/auto';
  
  if (modelId === 'openrouter/auto') {
    console.log(`  ${chalk.gray('estimated max cost')}: ${chalk.cyan('Variable (Auto Router)')}`);
  } else {
    const pricePerMillion = await getModelPrice(modelId, createApiClient);
    const estimatedCost = calculateEstimatedCost(pricePerMillion, info.tasks, info.maxTokens);
    
    if (pricePerMillion > 0) {
      console.log(`  ${chalk.gray('estimated max cost')}: ${chalk.yellow(`$${estimatedCost.toFixed(2)}`)}`);
    } else {
      console.log(`  ${chalk.gray('estimated max cost')}: ${chalk.green('Free')}`);
    }
  }
  
  if (info.tasks.length > 0) {
    const totalItems = info.tasks.reduce((sum, task) => sum + (task.count || 0), 0);
    console.log(`\n  ${chalk.gray('Tasks')} (${info.tasksCount}), ${chalk.gray('Total items')}: ${chalk.bold(totalItems)}`);
    
    info.tasks.forEach((task, i) => {
      const taskInfo = Object.entries(task)
        .filter(([k]) => k !== 'count')
        .map(([k, v]) => `${k}=${v}`)
        .join(', ');
      console.log(`    ${i + 1}. ${chalk.cyan(task.count)} items: ${taskInfo}`);
    });
  }
}

program
  .name(packageJson.name.split('/').pop()) // Remove scope if present
  .description(packageJson.description)
  .version(packageJson.version);

program
  .command('generate', { isDefault: true })
  .description('Generate data using configuration')
  .option('-c, --config <path>', 'Path to configuration file')
  .option('-m, --model <model>', 'Override model from config')
  .option('-t, --temperature <value>', 'Override temperature (0-2)')
  .option('-o, --output <path>', 'Override output path')
  .option('--count <number>', 'Override count for first task')
  .option('--max-tokens <number>', 'Override max tokens')
  .option('--no-interactive', 'Skip interactive prompts')
  .action(async (options) => {
    try {
      const configManager = new ConfigManager();
      
      let config;
      let overrides = {};
      
      // Model will be selected later in the wizard flow
      let selectedModel;
      let skipParameterConfig = false;
      
      let continueProgram = true;
      while (continueProgram) {
        if (options.interactive !== false && !options.config) {
        const { setupMode } = await inquirer.prompt([
          {
            type: 'list',
            name: 'setupMode',
            message: 'How would you like to configure the generation?',
            choices: [
              { name: '📁 Use existing config file', value: 'config' },
              { name: '🛠️  Set up manually', value: 'manual' },
              { name: '📂 Open configs folder', value: 'open_configs' },
              { name: '❌ Exit', value: 'exit' }
            ]
          }
        ]);
        
        if (setupMode === 'config') {
          const selectedConfigPath = await selectConfig(configManager);
          
          if (selectedConfigPath === null) {
            console.log(chalk.gray('\nReturning to main menu...'));
            continue;
          }
          
          config = await configManager.loadConfig(selectedConfigPath);
          
          await displayConfiguration(config, configManager);
          
          const { configAction } = await inquirer.prompt([
            {
              type: 'list',
              name: 'configAction',
              message: 'What would you like to do?',
              choices: [
                { name: '🚀 Start generation with current settings', value: 'start' },
                { name: '🤖 Change model only', value: 'change_model' },
                { name: '⚙️  Configure all parameters', value: 'configure' },
                { name: '⬅️  Back to main menu', value: 'back' }
              ]
            }
          ]);
          
          if (configAction === 'back') {
            continue;
          }
          
          if (configAction === 'start') {
            skipParameterConfig = true;
          } else if (configAction === 'change_model') {
            const currentModel = config.api?.model || 'openrouter/auto';
            selectedModel = await handleModelSelection(config, currentModel);
            
            if (selectedModel === null) {
              continue;
            }
            
            await displayConfiguration(config, configManager);
            
            skipParameterConfig = true;
          } else if (configAction === 'configure') {
            if (!options.model) {
              const currentModel = config.api?.model || 'openrouter/auto';
              selectedModel = await handleModelSelection(config, currentModel);
              
              if (selectedModel === null) {
                continue;
              }
            }
            
            await displayConfiguration(config, configManager);
          }
          
          break;
        } else if (setupMode === 'manual') {
          config = await setupManualConfig();
          
          if (config === null) {
            console.log(chalk.yellow('\nReturning to main menu...'));
            continue;
          }
          
          if (!options.model) {
            const currentModel = 'openrouter/auto';
            selectedModel = await handleModelSelection(config, currentModel);
            
            if (selectedModel === null) {
              continue;
            }
          }
          
          await displayConfiguration(config, configManager);
          
          break;
        } else if (setupMode === 'open_configs') {
          const configsPath = path.join(__dirname, 'configs');
          console.log(chalk.cyan(`\n📂 Opening configs folder: ${configsPath}`));
          
          const { platform } = process;
          const { exec } = await import('child_process');
          
          let command;
          if (platform === 'darwin') {
            command = `open "${configsPath}"`;
          } else if (platform === 'win32') {
            command = `start "" "${configsPath}"`;
          } else {
            command = `xdg-open "${configsPath}" 2>/dev/null || echo "Please open: ${configsPath}"`;
          }
          
          exec(command, (error) => {
            if (error) {
              console.log(chalk.yellow(`\nCouldn't open folder automatically.`));
              console.log(chalk.white(`Please manually open: ${configsPath}`));
            } else {
              console.log(chalk.green('✓ Folder opened in your file manager'));
            }
          });
          
          await new Promise(resolve => setTimeout(resolve, 1500));
          
          continue;
        } else if (setupMode === 'exit') {
          console.log(chalk.gray('\nGoodbye! 👋'));
          return;
        }
        
        } else {
          if (options.config) {
            config = await configManager.loadConfig(options.config);
          } else {
            config = await configManager.loadDefaultConfig();
          }
        }
        
        if (config) {
          break;
        }
      }
      
      if (!config) {
        console.error(chalk.red('No configuration loaded.'));
        return;
      }
      
      config = configManager.applyCliOptions(config, options);
      
      if (selectedModel && !options.model) {
        updateConfigModel(config, selectedModel);
      }
      
      if (options.interactive !== false && !options.config && !skipParameterConfig &&
          !options.temperature && !options.output && !options.count && !options.maxTokens) {
        const result = await configureParameters(config);
        
        if (result.action === 'cancel') {
          console.log(chalk.yellow('\nGeneration cancelled.'));
          return;
        }
        
        overrides = result.overrides;
        config = configManager.mergeConfigs(config, overrides);
        
      }
      
      
      console.log(chalk.bold('\n📊 Generation Summary:'));
      const info = configManager.getConfigInfo(config);
      
      const totalItems = info.tasks.reduce((sum, task) => sum + (task.count || 0), 0);
      const totalRequests = info.tasks.length;
      const maxTokensPerRequest = info.maxTokens;
      const estimatedTotalTokens = totalItems * maxTokensPerRequest;
      
      console.log(`  ${chalk.gray('Total items to generate')}: ${chalk.bold(totalItems)}`);
      console.log(`  ${chalk.gray('Total tasks')}: ${chalk.bold(totalRequests)}`);
      console.log(`  ${chalk.gray('Max tokens per item')}: ${chalk.bold(maxTokensPerRequest.toLocaleString())}`);
      console.log(`  ${chalk.gray('Estimated total tokens')}: ${chalk.bold(estimatedTotalTokens.toLocaleString())}`);
      
      const modelId = config.api?.model || 'openrouter/auto';
      if (modelId === 'openrouter/auto') {
        console.log(`  ${chalk.gray('Estimated max cost')}: ${chalk.cyan('Variable (Auto Router)')}`);
      } else {
        const pricePerMillion = await getModelPrice(modelId, createApiClient);
        const estimatedCost = calculateEstimatedCost(pricePerMillion, info.tasks, info.maxTokens);
        
        if (pricePerMillion > 0) {
          console.log(`  ${chalk.gray('Price per million tokens')}: ${chalk.yellow(`$${pricePerMillion.toFixed(2)}`)}`);
          console.log(`  ${chalk.gray('Estimated max cost')}: ${chalk.yellow(`$${estimatedCost.toFixed(4)}`)}`);
        } else {
          console.log(`  ${chalk.gray('Estimated max cost')}: ${chalk.green('Free')}`);
        }
      }
      
      if (options.interactive !== false) {
        console.log('');
        const { confirmGeneration } = await inquirer.prompt([
          {
            type: 'list',
            name: 'confirmGeneration',
            message: chalk.yellow('Do you want to start generation?'),
            choices: [
              { name: '✅ Yes, start generation', value: 'yes' },
              { name: '❌ No, go back to menu', value: 'no' }
            ],
            default: 0
          }
        ]);
        
        if (confirmGeneration === 'no') {
          if (!options.config) {
            config = null;
            selectedModel = null;
            skipParameterConfig = false;
            overrides = {};
            continueProgram = true;
            
          } else {
            console.log(chalk.gray('\nGeneration cancelled.'));
            return;
          }
        } else {
          // Generate data
          const generator = new DataGenerator(config);
          await generator.generateAll();
          continueProgram = false;
        }
      } else {
        // Non-interactive mode - generate data
        const generator = new DataGenerator(config);
        await generator.generateAll();
        continueProgram = false;
      }
      
    } catch (error) {
      console.error(chalk.red(`\n❌ Error: ${error.message}`));
      process.exit(1);
    }
  });

program
  .command('validate <file>')
  .description('Validate existing JSON file against schema')
  .option('-s, --schema <path>', 'Path to schema file or config with schema')
  .action(validateFile);

program
  .command('test-connection')
  .description('Test connection to OpenRouter API')
  .option('-k, --api-key <key>', 'API key (or use OPENROUTER_API_KEY env)')
  .action(testConnection);

program
  .command('create-config <type>')
  .description('Create example configuration file')
  .option('-o, --output <path>', 'Output path', './config.json')
  .action(async (type, options) => {
    const configManager = new ConfigManager();
    await createConfig(type, options, configManager);
  });

program
  .command('list-examples')
  .description('List available example configurations')
  .action(async () => {
    const configManager = new ConfigManager();
    await listExamples(configManager);
  });

// Create dynamic header based on package.json
const appDisplayName = 'LLM Data Generator'; // Short display name
const version = packageJson.version;
const headerText = `${appDisplayName} v${version}`;
const headerWidth = Math.max(headerText.length + 4, 40); // Min width 40
const padding = Math.floor((headerWidth - headerText.length) / 2);
const paddedHeader = ' '.repeat(padding) + headerText + ' '.repeat(headerWidth - headerText.length - padding);

console.log(chalk.blue.bold(`
╔${'═'.repeat(headerWidth)}╗
║${paddedHeader}║
╚${'═'.repeat(headerWidth)}╝
`));

program.parse(process.argv);
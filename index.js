#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { ConfigManager } from './lib/configManager.js';
import { DataGenerator } from './lib/generator.js';
import { OpenRouterClient } from './lib/apiClient.js';
import { setupApiKey } from './lib/setupApiKey.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read package.json for metadata
const packageJson = JSON.parse(
  await fs.readFile(path.join(__dirname, 'package.json'), 'utf-8')
);

const program = new Command();

// Global variable to store session API key
let sessionApiKey = null;

async function ensureApiKey() {
  // If we already have a session key, use it
  if (sessionApiKey) {
    process.env.OPENROUTER_API_KEY = sessionApiKey;
    return sessionApiKey;
  }
  
  // Check if API key exists
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (apiKey) {
    // Validate the existing key
    try {
      const client = new OpenRouterClient();
      await client.testConnection();
      return apiKey;
    } catch (error) {
      console.log(chalk.yellow('\n⚠️  Existing API key appears to be invalid.'));
    }
  }
  
  // No valid key found, run setup
  sessionApiKey = await setupApiKey();
  return sessionApiKey;
}

async function createApiClient(config = {}) {
  // If API key is provided in config, use it directly
  if (config.apiKey) {
    return new OpenRouterClient(config);
  }
  
  await ensureApiKey();
  return new OpenRouterClient(config);
}

async function showModalityFilter(models, currentModel) {
  // Collect all unique input modalities from all models
  const allModalities = new Set();
  models.forEach(model => {
    if (model.architecture?.input_modalities) {
      model.architecture.input_modalities.forEach(modality => allModalities.add(modality));
    }
  });
  
  // Convert to sorted array and create choices
  const modalityChoices = [
    { name: '⬅️ Back to main menu', value: 'back' },
    { name: '────────────────────────────────────────', disabled: true }
  ];
  
  const sortedModalities = Array.from(allModalities).sort();
  sortedModalities.forEach(modality => {
    const count = models.filter(m => m.architecture?.input_modalities?.includes(modality)).length;
    const icon = modality === 'image' ? '👁️' : modality === 'audio' ? '🎵' : '📝';
    modalityChoices.push({
      name: `${icon} ${modality} (${count} models)`,
      value: modality
    });
  });
  
  console.log('\n' + chalk.blue('Filter by input modality:'));
  
  const { selectedModality } = await inquirer.prompt([
    {
      type: 'list',
      name: 'selectedModality',
      message: 'Select modality to filter by:',
      choices: modalityChoices,
      pageSize: Math.min(process.stdout.rows - 10, modalityChoices.length),
      loop: false
    }
  ]);
  
  if (selectedModality === 'back') {
    return selectModel(currentModel);
  }
  
  // Filter models by selected modality
  const filteredModels = models.filter(m => m.architecture?.input_modalities?.includes(selectedModality));
  return showFilteredModels(models, `modality_${selectedModality}`, currentModel);
}

async function showParameterFilter(models, currentModel) {
  // Collect all unique supported parameters from all models
  const allParameters = new Set();
  models.forEach(model => {
    if (model.supported_parameters) {
      model.supported_parameters.forEach(param => allParameters.add(param));
    }
  });
  
  // Convert to sorted array and create choices
  const paramChoices = [
    { name: '⬅️ Back to main menu', value: 'back' },
    { name: '────────────────────────────────────────', disabled: true }
  ];
  
  const sortedParams = Array.from(allParameters).sort();
  sortedParams.forEach(param => {
    const count = models.filter(m => m.supported_parameters?.includes(param)).length;
    paramChoices.push({
      name: `📌 ${param} (${count} models)`,
      value: param
    });
  });
  
  console.log('\n' + chalk.blue('Filter by parameter:'));
  
  const { selectedParam } = await inquirer.prompt([
    {
      type: 'list',
      name: 'selectedParam',
      message: 'Select parameter to filter by:',
      choices: paramChoices,
      pageSize: Math.min(process.stdout.rows - 10, paramChoices.length),
      loop: false
    }
  ]);
  
  if (selectedParam === 'back') {
    return selectModel(currentModel);
  }
  
  // Filter models by selected parameter
  const filteredModels = models.filter(m => m.supported_parameters?.includes(selectedParam));
  return showFilteredModels(models, `param_${selectedParam}`, currentModel);
}

async function showFilteredModels(models, filterType, currentModel) {
  let filteredModels = [];
  let filterTitle = '';
  
  switch (filterType) {
    case 'filter_free':
      filteredModels = models.filter(m => {
        const promptPrice = parseFloat(m.pricing?.prompt || '0');
        return promptPrice === 0 || m.id.includes(':free');
      });
      filterTitle = 'Free Models';
      break;
      
    case 'filter_paid':
      filteredModels = models.filter(m => {
        const promptPrice = parseFloat(m.pricing?.prompt || '0');
        return promptPrice > 0 && !m.id.includes(':free');
      });
      filterTitle = 'Paid Models';
      break;
      
    case 'filter_vision':
      filteredModels = models.filter(m => 
        m.architecture?.input_modalities?.includes('image')
      );
      filterTitle = 'Models with Vision';
      break;
      
    case 'filter_functions':
      filteredModels = models.filter(m => 
        m.supported_parameters?.includes('tools')
      );
      filterTitle = 'Models with Function Calling';
      break;
      
    case 'filter_reasoning':
      filteredModels = models.filter(m => 
        m.supported_parameters?.includes('reasoning')
      );
      filterTitle = 'Models with Reasoning';
      break;
      
    default:
      // Handle dynamic parameter filters
      if (filterType.startsWith('param_')) {
        const param = filterType.substring(6);
        filteredModels = models.filter(m => m.supported_parameters?.includes(param));
        filterTitle = `Models with ${param}`;
      } else if (filterType.startsWith('modality_')) {
        const modality = filterType.substring(9);
        filteredModels = models.filter(m => m.architecture?.input_modalities?.includes(modality));
        filterTitle = `Models with ${modality} input`;
      }
      break;
  }
  
  const choices = [];
  
  // Add current model as first option if it's in the filtered list
  const currentInFiltered = filteredModels.find(m => m.id === currentModel);
  if (currentInFiltered) {
    const promptPrice = parseFloat(currentInFiltered.pricing?.prompt || '0');
    const isFree = promptPrice === 0 || currentInFiltered.id.includes(':free');
    const pricePerMillion = promptPrice * 1000000;
    
    let priceStr;
    if (isFree) {
      priceStr = 'Free';
    } else if (pricePerMillion < 1) {
      priceStr = `$${pricePerMillion.toFixed(3)}/M`;
    } else if (pricePerMillion < 10) {
      priceStr = `$${pricePerMillion.toFixed(2)}/M`;
    } else {
      priceStr = `$${pricePerMillion.toFixed(1)}/M`;
    }
    
    const priceEmoji = isFree ? '🆓' : '💰';
    const price = `${priceEmoji} ${priceStr.padEnd(8)}`;
    
    const contextWindow = currentInFiltered.context_length ? 
      `${(currentInFiltered.context_length / 1000).toFixed(0)}K` : '?';
    const contextStr = `[${contextWindow.padStart(5)}]`;
    
    const caps = [];
    if (currentInFiltered.supported_parameters?.includes('tools')) caps.push('🔧');
    if (currentInFiltered.architecture?.input_modalities?.includes('image')) caps.push('👁️');
    if (currentInFiltered.supported_parameters?.includes('stream')) caps.push('⚡');
    const capsStr = caps.join('');
    const capsPadded = capsStr.padEnd(3);
    
    const dateStr = currentInFiltered.created ? 
      new Date(currentInFiltered.created * 1000).toLocaleDateString('en-US', { 
        month: '2-digit', 
        day: '2-digit', 
        year: 'numeric' 
      }) : '';
    
    const namePart = currentInFiltered.name.substring(0, 40).padEnd(40);
    const pricePart = price.padEnd(12);
    
    choices.push({
      name: `✅ ${pricePart}${namePart} ${contextStr} ${capsPadded} ${dateStr} (current)`,
      value: currentModel
    });
    choices.push({ name: '────────────────────────────────────────', disabled: true });
  }
  
  choices.push(
    { name: '⬅️ Back to main menu', value: 'back' },
    { name: '────────────────────────────────────────', disabled: true }
  );
  
  // Add filtered models (skip current if already shown)
  filteredModels.forEach(model => {
    if (model.id === currentModel) return; // Skip current model as it's already shown
    const promptPrice = parseFloat(model.pricing?.prompt || '0');
    const isFree = promptPrice === 0 || model.id.includes(':free');
    const pricePerMillion = promptPrice * 1000000;
    
    let priceStr;
    if (isFree) {
      priceStr = 'Free';
    } else if (pricePerMillion < 1) {
      priceStr = `$${pricePerMillion.toFixed(3)}/M`;
    } else if (pricePerMillion < 10) {
      priceStr = `$${pricePerMillion.toFixed(2)}/M`;
    } else {
      priceStr = `$${pricePerMillion.toFixed(1)}/M`;
    }
    
    const priceEmoji = isFree ? '🆓' : '💰';
    const price = `${priceEmoji} ${priceStr.padEnd(8)}`;
    
    const contextWindow = model.context_length ? 
      `${(model.context_length / 1000).toFixed(0)}K` : '?';
    const contextStr = `[${contextWindow.padStart(5)}]`;
    
    const caps = [];
    if (model.supported_parameters?.includes('tools')) caps.push('🔧');
    if (model.architecture?.input_modalities?.includes('image')) caps.push('👁️');
    if (model.supported_parameters?.includes('stream')) caps.push('⚡');
    const capsStr = caps.join('');
    const capsPadded = capsStr.padEnd(3);
    
    const dateStr = model.created ? 
      new Date(model.created * 1000).toLocaleDateString('en-US', { 
        month: '2-digit', 
        day: '2-digit', 
        year: 'numeric' 
      }) : '';
    
    const namePart = model.name.substring(0, 40).padEnd(40);
    const pricePart = price.padEnd(12);
    
    choices.push({
      name: `${pricePart}${namePart} ${contextStr} ${capsPadded} ${dateStr}`,
      value: model.id
    });
  });
  
  choices.push({ name: '────────────────────────────────────────', disabled: true });
  choices.push({ name: '🔍 Enter manually...', value: 'other' });
  
  console.log('\n' + chalk.blue(`Filtered: ${filterTitle} (${filteredModels.length} models)`));
  console.log(chalk.gray('Legend: 🆓=Free 💰=Paid | [context] | 🔧=functions 👁️=vision ⚡=streaming | MM/DD/YYYY'));
  
  const { model } = await inquirer.prompt([
    {
      type: 'list',
      name: 'model',
      message: 'Select model (press Enter to keep current):',
      choices: choices,
      pageSize: Math.min(process.stdout.rows - 10, choices.length),
      loop: false,
      default: 0  // Default to first choice, which is the current model if it exists
    }
  ]);
  
  if (model === 'back') {
    return selectModel(currentModel);
  }
  
  if (model === 'other') {
    return promptCustomModel();
  }
  
  return model;
}

async function selectModel(currentModel) {
  console.log(chalk.cyan(`\n🤖 Current model: ${currentModel}`));
  
  // Create client and fetch account info
  const client = await createApiClient();
  
  // Try to get and display user info first
  const userInfo = await client.getUserInfo();
  if (userInfo.success && userInfo.data?.data) {
    console.log(chalk.bold('\n👤 Account Info:'));
    const data = userInfo.data.data;
    
    // OpenRouter /auth/key endpoint format
    if (data.limit !== undefined && data.usage !== undefined) {
      const limit = parseFloat(data.limit);
      const usage = parseFloat(data.usage);
      const remaining = parseFloat(data.limit_remaining || (limit - usage));
      const percentUsed = limit > 0 ? (usage / limit * 100).toFixed(1) : 0;
      
      console.log(`  ${chalk.gray('balance')}: ${chalk.green(`$${remaining.toFixed(2)}`)} of $${limit.toFixed(2)} (${percentUsed}% used)`);
      console.log(`  ${chalk.gray('usage')}: ${chalk.yellow(`$${usage.toFixed(2)}`)}`);
      
      if (data.is_free_tier !== undefined) {
        console.log(`  ${chalk.gray('tier')}: ${data.is_free_tier ? chalk.cyan('Free') : chalk.yellow('Paid')}`);
      }
      
      if (data.rate_limit) {
        console.log(`  ${chalk.gray('rate limit')}: ${chalk.cyan(`${data.rate_limit.requests} requests per ${data.rate_limit.interval}`)}`);
      }
    }
  }
  
  // Fetch models from API
  const spinner = ora('Fetching available models...').start();
  const models = await client.getModels();
  spinner.succeed('Fetched available models');  // Use succeed() instead of stop() for cleaner output
  
  if (models.length === 0) {
    console.error(chalk.red('Failed to fetch models. Using default.'));
    return currentModel;
  }
  
  // Prepare choices
  const choices = [];
  
  // Add current model as first option if it's not auto router
  if (currentModel && currentModel !== 'openrouter/auto') {
    // Find the current model in the list to get its details
    const currentModelData = models.find(m => m.id === currentModel);
    if (currentModelData) {
      // Format current model with details
      const promptPrice = parseFloat(currentModelData.pricing?.prompt || '0');
      const isFree = promptPrice === 0 || currentModelData.id.includes(':free');
      const pricePerMillion = promptPrice * 1000000;
      
      let priceStr;
      if (isFree) {
        priceStr = 'Free';
      } else if (pricePerMillion < 1) {
        priceStr = `$${pricePerMillion.toFixed(3)}/M`;
      } else if (pricePerMillion < 10) {
        priceStr = `$${pricePerMillion.toFixed(2)}/M`;
      } else {
        priceStr = `$${pricePerMillion.toFixed(1)}/M`;
      }
      
      const priceEmoji = isFree ? '🆓' : '💰';
      const price = `${priceEmoji} ${priceStr.padEnd(8)}`;
      
      const contextWindow = currentModelData.context_length ? 
        `${(currentModelData.context_length / 1000).toFixed(0)}K` : '?';
      const contextStr = `[${contextWindow.padStart(5)}]`;
      
      const caps = [];
      if (currentModelData.supported_parameters?.includes('tools')) caps.push('🔧');
      if (currentModelData.architecture?.input_modalities?.includes('image')) caps.push('👁️');
      if (currentModelData.supported_parameters?.includes('stream')) caps.push('⚡');
      const capsStr = caps.join('');
      const capsPadded = capsStr.padEnd(3);
      
      const dateStr = currentModelData.created ? 
        new Date(currentModelData.created * 1000).toLocaleDateString('en-US', { 
          month: '2-digit', 
          day: '2-digit', 
          year: 'numeric' 
        }) : '';
      
      const namePart = currentModelData.name.substring(0, 40).padEnd(40);
      const pricePart = price.padEnd(12);
      
      choices.push({
        name: `✅ ${pricePart}${namePart} ${contextStr} ${capsPadded} ${dateStr} (current)`,
        value: currentModel
      });
      choices.push({ name: '────────────────────────────────────────', disabled: true });
    } else {
      // Current model not found in list, add it as simple option
      choices.push({
        name: `✅ ${currentModel} (current)`,
        value: currentModel
      });
      choices.push({ name: '────────────────────────────────────────', disabled: true });
    }
  }
  
  // Add auto router
  choices.push({ name: '🤖 Auto Router (selects best available model)', value: 'openrouter/auto' });
  
  // Use first 25 models
  const displayModels = models.slice(0, 25);
  
  // Add first 25 models with detailed info (skip current if already shown)
  displayModels.forEach(model => {
    if (currentModel && model.id === currentModel) return; // Skip current model as it's already shown
    // OpenRouter API uses pricing.prompt for price per token, need to multiply by 1M
    const promptPrice = parseFloat(model.pricing?.prompt || '0');
    const isFree = promptPrice === 0 || model.id.includes(':free');
    const pricePerMillion = promptPrice * 1000000;
    
    // Format price string with proper padding
    let priceStr;
    if (isFree) {
      priceStr = 'Free';
    } else if (pricePerMillion < 1) {
      priceStr = `$${pricePerMillion.toFixed(3)}/M`;
    } else if (pricePerMillion < 10) {
      priceStr = `$${pricePerMillion.toFixed(2)}/M`;
    } else {
      priceStr = `$${pricePerMillion.toFixed(1)}/M`;
    }
    
    const priceEmoji = isFree ? '🆓' : '💰';
    const price = `${priceEmoji} ${priceStr.padEnd(8)}`;
    
    // Format context window
    const contextWindow = model.context_length ? 
      `${(model.context_length / 1000).toFixed(0)}K` : '?';
    const contextStr = `[${contextWindow.padStart(5)}]`;
    
    // Get model capabilities
    const caps = [];
    if (model.supported_parameters?.includes('tools')) caps.push('🔧');
    if (model.architecture?.input_modalities?.includes('image')) caps.push('👁️');
    if (model.supported_parameters?.includes('stream')) caps.push('⚡');
    const capsStr = caps.join('');
    const capsPadded = capsStr.padEnd(3);
    
    // Format date if available
    const dateStr = model.created ? 
      new Date(model.created * 1000).toLocaleDateString('en-US', { 
        month: '2-digit', 
        day: '2-digit', 
        year: 'numeric' 
      }) : '';
    
    // Format with fixed widths to prevent flickering
    const namePart = model.name.substring(0, 40).padEnd(40);
    const pricePart = price.padEnd(12);
    
    choices.push({
      name: `${pricePart}${namePart} ${contextStr} ${capsPadded} ${dateStr}`,
      value: model.id,
      short: model.name  // Store original name for display
    });
  });
  
  // Add options for more models and filters
  choices.push({ name: '────────────────────────────────────────', disabled: true });
  choices.push({ name: '🆓 Show only free models', value: 'filter_free' });
  choices.push({ name: '💰 Show only paid models', value: 'filter_paid' });
  choices.push({ name: '👁️ Show models with vision', value: 'filter_vision' });
  choices.push({ name: '🔧 Show models with functions', value: 'filter_functions' });
  choices.push({ name: '🧠 Show models with reasoning', value: 'filter_reasoning' });
  choices.push({ name: '📊 Show models by parameter...', value: 'filter_by_param' });
  choices.push({ name: '🎭 Show models by modality...', value: 'filter_by_modality' });
  if (models.length > 25) {
    choices.push({ name: '📋 Show all models', value: 'show_all' });
  }
  choices.push({ name: '🔍 Enter manually...', value: 'other' });
  
  console.log('\n' + chalk.gray('Legend: 🆓=Free 💰=Paid | [context] | 🔧=functions 👁️=vision ⚡=streaming | MM/DD/YYYY'));
  
  const { model } = await inquirer.prompt([
    {
      type: 'list',
      name: 'model',
      message: 'Select LLM model (press Enter to keep current):',
      choices: choices,
      pageSize: Math.min(process.stdout.rows - 10, choices.length),  // Use terminal height
      loop: false,
      default: 0  // Default to first choice, which is the current model if it exists
    }
  ]);

  // Handle filters
  if (model === 'filter_by_param') {
    return showParameterFilter(models, currentModel);
  }
  
  if (model === 'filter_by_modality') {
    return showModalityFilter(models, currentModel);
  }
  
  if (model.startsWith('filter_')) {
    return showFilteredModels(models, model, currentModel);
  }
  
  if (model === 'show_all') {
    // Show all models
    const allChoices = [
      { name: '🤖 Auto Router (selects best available model)', value: 'openrouter/auto' }
    ];
    
    // No need to calculate max lengths - use fixed widths
    
    models.forEach(m => {
      // OpenRouter API uses pricing.prompt for price per token, need to multiply by 1M
      const promptPrice = parseFloat(m.pricing?.prompt || '0');
      const isFree = promptPrice === 0 || m.id.includes(':free');
      const pricePerMillion = promptPrice * 1000000;
      
      // Format price string with proper padding
      let priceStr;
      if (isFree) {
        priceStr = 'Free';
      } else if (pricePerMillion < 1) {
        priceStr = `$${pricePerMillion.toFixed(3)}/M`;
      } else if (pricePerMillion < 10) {
        priceStr = `$${pricePerMillion.toFixed(2)}/M`;
      } else {
        priceStr = `$${pricePerMillion.toFixed(1)}/M`;
      }
      
      const priceEmoji = isFree ? '🆓' : '💰';
      const price = `${priceEmoji} ${priceStr.padEnd(8)}`;
      
      // Format context window
      const contextWindow = m.context_length ? 
        `${(m.context_length / 1000).toFixed(0)}K` : '?';
      const contextStr = `[${contextWindow.padStart(5)}]`;
      
      // Get model capabilities
      const caps = [];
      if (m.supported_parameters?.includes('tools')) caps.push('🔧');
      if (m.architecture?.input_modalities?.includes('image')) caps.push('👁️');
      if (m.supported_parameters?.includes('stream')) caps.push('⚡');
      const capsStr = caps.join('');
      const capsPadded = capsStr.padEnd(3);
      
      // Format date if available
      const dateStr = m.created ? 
        new Date(m.created * 1000).toLocaleDateString('en-US', { 
          month: '2-digit', 
          day: '2-digit', 
          year: 'numeric' 
        }) : '';
      
      // Format with fixed widths to prevent flickering
      const namePart = m.name.substring(0, 40).padEnd(40);
      const pricePart = price.padEnd(12);
      
      allChoices.push({
        name: `${pricePart}${namePart} ${contextStr} ${capsPadded} ${dateStr}`,
        value: m.id
      });
    });
    
    allChoices.push({ name: '🔍 Enter manually...', value: 'other' });
    
    console.log('\n' + chalk.gray('Legend: 🆓=Free 💰=Paid | [context] | 🔧=functions 👁️=vision ⚡=streaming | MM/DD/YYYY'));
    
    const { allModel } = await inquirer.prompt([
      {
        type: 'list',
        name: 'allModel',
        message: 'Select LLM model (all models):',
        choices: allChoices,
        pageSize: Math.min(process.stdout.rows - 10, allChoices.length),  // Use terminal height
        loop: false,
        default: allChoices.findIndex(c => c.value === currentModel) || 0
      }
    ]);
    
    if (allModel === 'other') {
      return promptCustomModel();
    }
    return allModel;
  }
  
  if (model === 'other') {
    return promptCustomModel();
  }

  return model;
}

async function promptCustomModel() {
  const { customModel } = await inquirer.prompt([
    {
      type: 'input',
      name: 'customModel',
      message: 'Enter model name (e.g., openai/gpt-3.5-turbo):',
      validate: input => input.trim() !== '' || 'Model name cannot be empty'
    }
  ]);
  return customModel;
}

async function selectConfig(configManager) {
  console.log(chalk.cyan('\n📁 Select configuration:'));
  
  // Start at package's configs directory
  const packageConfigsPath = path.join(__dirname, 'configs');
  let currentPath = packageConfigsPath;
  let selectedConfig = null;
  
  while (!selectedConfig) {
    // Get files and directories in current path
    const items = [];
    try {
      const files = await fs.readdir(currentPath, { withFileTypes: true });
      
      // Add parent directory option if not at root
      if (currentPath !== packageConfigsPath) {
        items.push({
          name: '⬆️  .. (parent directory)',
          value: { type: 'parent' }
        });
      }
      
      // Sort: directories first, then files
      const sorted = files.sort((a, b) => {
        if (a.isDirectory() && !b.isDirectory()) return -1;
        if (!a.isDirectory() && b.isDirectory()) return 1;
        return a.name.localeCompare(b.name);
      });
      
      // Add items with icons
      for (const item of sorted) {
        if (item.isDirectory()) {
          items.push({
            name: `📂 ${item.name}/`,
            value: { type: 'dir', name: item.name, path: path.join(currentPath, item.name) }
          });
        } else if (item.name.endsWith('.json')) {
          const isDefault = item.name === 'default.json';
          const icon = isDefault ? '⭐' : '📄';
          const suffix = isDefault ? ' (default)' : '';
          items.push({
            name: `${icon} ${item.name}${suffix}`,
            value: { type: 'file', name: item.name, path: path.join(currentPath, item.name) }
          });
        }
      }
      
      if (items.length === 0 || (items.length === 1 && items[0].value.type === 'parent')) {
        console.log(chalk.yellow('No configuration files found in this directory.'));
        if (currentPath !== packageConfigsPath) {
          currentPath = path.dirname(currentPath);
          continue;
        } else {
          throw new Error('No configuration files found');
        }
      }
      
      // Show current path (relative to package configs)
      const displayPath = path.relative(packageConfigsPath, currentPath) || 'configs';
      console.log(chalk.gray(`Current path: ${displayPath}`));
      
      // Prompt for selection
      const { selection } = await inquirer.prompt([
        {
          type: 'list',
          name: 'selection',
          message: 'Choose configuration or navigate:',
          choices: items,
          default: items.findIndex(item => item.value?.name === 'default.json') || 0
        }
      ]);
      
      // Handle selection
      if (selection.type === 'parent') {
        currentPath = path.dirname(currentPath);
      } else if (selection.type === 'dir') {
        currentPath = selection.path;
      } else if (selection.type === 'file') {
        selectedConfig = selection.path;
      }
    } catch (error) {
      console.error(chalk.red(`Error reading directory: ${error.message}`));
      throw error;
    }
  }
  
  return selectedConfig;
}

async function configureParameters(config) {
  console.log(chalk.cyan('\n⚙️  Configuration Parameters:'));
  console.log(chalk.gray('Press Enter to keep default values'));
  
  const overrides = {};
  
  // API parameters
  console.log(chalk.yellow('\n🤖 API Settings:'));
  
  // Temperature
  const { temperature } = await inquirer.prompt([
    {
      type: 'input',
      name: 'temperature',
      message: `Temperature (0-2) [current: ${config.api?.temperature || 0.7}]:`,
      validate: input => {
        if (input === '') return true;
        const num = parseFloat(input);
        return (!isNaN(num) && num >= 0 && num <= 2) || 'Temperature must be between 0 and 2';
      }
    }
  ]);
  if (temperature !== '') {
    if (!overrides.api) overrides.api = {};
    overrides.api.temperature = parseFloat(temperature);
  }
  
  // Max tokens
  const { maxTokens } = await inquirer.prompt([
    {
      type: 'input',
      name: 'maxTokens',
      message: `Max tokens [current: ${config.api?.maxTokens || 4000}]:`,
      validate: input => {
        if (input === '') return true;
        const num = parseInt(input);
        return (!isNaN(num) && num > 0) || 'Max tokens must be a positive number';
      }
    }
  ]);
  if (maxTokens !== '') {
    if (!overrides.api) overrides.api = {};
    overrides.api.maxTokens = parseInt(maxTokens);
  }
  
  // Output settings
  console.log(chalk.yellow('\n📁 Output Settings:'));
  
  const { outputPath } = await inquirer.prompt([
    {
      type: 'input',
      name: 'outputPath',
      message: `Output path [current: ${config.output?.outputPath || './output/'}]:`
    }
  ]);
  if (outputPath !== '') {
    if (!overrides.output) overrides.output = {};
    overrides.output.outputPath = outputPath;
  }
  
  // Generation settings
  if (config.generation?.tasks?.length > 0) {
    console.log(chalk.yellow('\n🔢 Generation Settings:'));
    
    const firstTask = config.generation.tasks[0];
    const { count } = await inquirer.prompt([
      {
        type: 'input',
        name: 'count',
        message: `Number of items to generate [current: ${firstTask.count || 10}]:`,
        validate: input => {
          if (input === '') return true;
          const num = parseInt(input);
          return (!isNaN(num) && num > 0) || 'Count must be a positive number';
        }
      }
    ]);
    if (count !== '') {
      if (!overrides.generation) overrides.generation = { tasks: [{}] };
      overrides.generation.tasks[0] = { ...firstTask, count: parseInt(count) };
    }
  }
  
  // Verbose mode
  console.log(chalk.yellow('\n🔍 Output Settings:'));
  
  const { verbose } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'verbose',
      message: 'Enable verbose mode (show generation details, tokens, costs)?',
      default: true
    }
  ]);
  if (verbose !== undefined) {
    overrides.verbose = verbose;
  }
  
  // Ask if user wants to start generation or configure more
  const { action } = await inquirer.prompt([
    {
      type: 'list',
      name: 'action',
      message: 'What would you like to do?',
      choices: [
        { name: '🚀 Start generation', value: 'start' },
        { name: '📝 Review configuration', value: 'review' },
        { name: '❌ Cancel', value: 'cancel' }
      ]
    }
  ]);
  
  return { overrides, action };
}

async function setupManualConfig() {
  console.log(chalk.cyan('\n🛠️  Manual Configuration Setup'));
  
  const config = {
    meta: {},
    api: {
      provider: 'openrouter',
      temperature: 0.7,
      maxTokens: 4000
    },
    output: {},
    schema: { type: 'object', properties: {} },
    prompts: {},
    generation: { tasks: [] }
  };
  
  // Basic info
  console.log(chalk.yellow('\n📝 Basic Information:'));
  const { name, description } = await inquirer.prompt([
    {
      type: 'input',
      name: 'name',
      message: 'Configuration name:',
      default: 'My Data Generator'
    },
    {
      type: 'input',
      name: 'description',
      message: 'Description (optional):'
    }
  ]);
  
  config.meta.name = name;
  config.meta.version = '1.0';
  if (description) config.meta.description = description;
  
  // System prompt
  console.log(chalk.yellow('\n🤖 System Prompt:'));
  const { systemPrompt } = await inquirer.prompt([
    {
      type: 'input',
      name: 'systemPrompt',
      message: 'System prompt for the LLM:',
      default: 'You are a helpful assistant that generates structured JSON data according to the provided schema.'
    }
  ]);
  config.prompts.system = systemPrompt;
  
  // Output settings
  console.log(chalk.yellow('\n📁 Output Settings:'));
  const { outputPath, fileNameTemplate } = await inquirer.prompt([
    {
      type: 'input',
      name: 'outputPath',
      message: 'Output directory:',
      default: './output/'
    },
    {
      type: 'input',
      name: 'fileNameTemplate',
      message: 'Filename template (use {index}, {theme}, etc.):',
      default: 'generated_{index}.json'
    }
  ]);
  
  config.output.type = 'array';
  config.output.outputPath = outputPath;
  config.output.fileNameTemplate = fileNameTemplate;
  
  // Schema setup
  console.log(chalk.yellow('\n📋 Data Schema:'));
  const { schemaSetup } = await inquirer.prompt([
    {
      type: 'list',
      name: 'schemaSetup',
      message: 'How would you like to define the schema?',
      choices: [
        { name: '📝 Simple fields (guided setup)', value: 'simple' },
        { name: '📄 Paste JSON Schema', value: 'json' },
        { name: '⏭️  Skip (free-form generation)', value: 'skip' }
      ]
    }
  ]);
  
  if (schemaSetup === 'simple') {
    // Simple field setup
    const fields = [];
    let addMore = true;
    
    while (addMore) {
      console.log(chalk.gray('\nAdd a field to your schema:'));
      const field = await inquirer.prompt([
        {
          type: 'input',
          name: 'name',
          message: 'Field name:',
          validate: input => input.trim() !== '' || 'Field name is required'
        },
        {
          type: 'list',
          name: 'type',
          message: 'Field type:',
          choices: ['string', 'number', 'boolean', 'array', 'object']
        },
        {
          type: 'input',
          name: 'description',
          message: 'Field description (helps LLM understand):'
        }
      ]);
      
      fields.push(field);
      
      const { continueAdding } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'continueAdding',
          message: 'Add another field?',
          default: true
        }
      ]);
      
      addMore = continueAdding;
    }
    
    // Build schema from fields
    fields.forEach(field => {
      config.schema.properties[field.name] = {
        type: field.type
      };
      if (field.description) {
        config.schema.properties[field.name]['x-llm-generate'] = {
          description: field.description
        };
      }
    });
    
    config.schema.required = fields.map(f => f.name);
    
  } else if (schemaSetup === 'json') {
    console.log(chalk.gray('Paste your JSON Schema (press Enter twice when done):'));
    let schemaInput = '';
    let line;
    const rl = require('readline').createInterface({
      input: process.stdin,
      output: process.stdout
    });
    
    // Simple multiline input
    console.log(chalk.gray('(End with empty line)'));
    const { schemaJson } = await inquirer.prompt([
      {
        type: 'editor',
        name: 'schemaJson',
        message: 'Enter JSON Schema:'
      }
    ]);
    
    try {
      config.schema = JSON.parse(schemaJson);
    } catch (error) {
      console.log(chalk.red('Invalid JSON. Using default schema.'));
    }
  }
  
  // Generation tasks
  console.log(chalk.yellow('\n🎯 Generation Tasks:'));
  const { taskCount } = await inquirer.prompt([
    {
      type: 'input',
      name: 'taskCount',
      message: 'How many items to generate?',
      default: '10',
      validate: input => {
        const num = parseInt(input);
        return (!isNaN(num) && num > 0) || 'Must be a positive number';
      }
    }
  ]);
  
  config.generation.tasks.push({ count: parseInt(taskCount) });
  
  // Ask if user wants to save the configuration
  const { saveConfig } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'saveConfig',
      message: 'Would you like to save this configuration for future use?',
      default: true
    }
  ]);
  
  if (saveConfig) {
    const { savePath } = await inquirer.prompt([
      {
        type: 'input',
        name: 'savePath',
        message: 'Save configuration as:',
        default: `./configs/${name.toLowerCase().replace(/\s+/g, '-')}.json`
      }
    ]);
    
    try {
      // Ensure directory exists
      const dir = path.dirname(savePath);
      await fs.mkdir(dir, { recursive: true });
      
      // Save configuration
      await fs.writeFile(savePath, JSON.stringify(config, null, 2));
      console.log(chalk.green(`✓ Configuration saved to ${savePath}`));
    } catch (error) {
      console.log(chalk.red(`Failed to save configuration: ${error.message}`));
    }
  }
  
  return config;
}

async function getModelPrice(modelId) {
  try {
    const client = await createApiClient();
    const models = await client.getModels();
    const model = models.find(m => m.id === modelId);
    if (model?.pricing?.prompt) {
      return parseFloat(model.pricing.prompt) * 1000000; // Price per million tokens
    }
  } catch (error) {
    // Ignore errors, return 0
  }
  return 0;
}

function calculateEstimatedCost(pricePerMillion, tasks, maxTokens) {
  const totalRequests = tasks.reduce((sum, task) => sum + (task.count || 0), 0);
  const estimatedTokens = totalRequests * maxTokens;
  const estimatedMillions = estimatedTokens / 1000000;
  return pricePerMillion * estimatedMillions;
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
      
      // If config is provided via CLI, use it directly
      if (options.config) {
        config = await configManager.loadConfig(options.config);
      } else if (options.interactive !== false) {
        // Ask user to choose between config file or manual setup
        const { setupMode } = await inquirer.prompt([
          {
            type: 'list',
            name: 'setupMode',
            message: 'How would you like to configure the generation?',
            choices: [
              { name: '📁 Use existing config file', value: 'config' },
              { name: '🛠️  Set up manually', value: 'manual' },
              { name: '📂 Open configs folder', value: 'open_configs' }
            ]
          }
        ]);
        
        if (setupMode === 'config') {
          // Interactive mode: select config through wizard
          const selectedConfigPath = await selectConfig(configManager);
          config = await configManager.loadConfig(selectedConfigPath);
          
          // Now select model after config is chosen
          if (!options.model) {
            const currentModel = config.api?.model || 'openrouter/auto';
            selectedModel = await selectModel(currentModel);
          }
        } else if (setupMode === 'manual') {
          // Manual setup: guide user through configuration
          config = await setupManualConfig();
          
          // Now select model for manual config
          if (!options.model) {
            const currentModel = 'openrouter/auto';
            selectedModel = await selectModel(currentModel);
          }
        } else if (setupMode === 'open_configs') {
          // Open configs folder
          const configsPath = path.join(__dirname, 'configs');
          console.log(chalk.cyan(`\n📂 Opening configs folder: ${configsPath}`));
          
          // Try to open folder based on platform
          const { platform } = process;
          const { exec } = await import('child_process');
          
          let command;
          if (platform === 'darwin') {
            command = `open "${configsPath}"`;
          } else if (platform === 'win32') {
            command = `start "" "${configsPath}"`;
          } else {
            // Linux and others
            command = `xdg-open "${configsPath}" 2>/dev/null || echo "Please open: ${configsPath}"`;
          }
          
          exec(command, (error) => {
            if (error) {
              console.log(chalk.yellow(`\nCouldn't open folder automatically.`));
              console.log(chalk.white(`Please manually open: ${configsPath}`));
            } else {
              console.log(chalk.green('✓ Folder opened in your file manager'));
            }
            console.log(chalk.gray('\nPress Ctrl+C to exit or run the command again to continue.'));
          });
          
          // Exit after opening folder
          return;
        }
      } else {
        // Non-interactive mode: use default
        config = await configManager.loadDefaultConfig();
      }
      
      // Apply CLI options first
      config = configManager.applyCliOptions(config, options);
      
      // Set the selected model if it was chosen interactively (overrides config model)
      if (selectedModel && !options.model) {
        if (!config.api) config.api = {};
        config.api.model = selectedModel;
      }
      
      // Interactive parameter configuration if in interactive mode and no CLI overrides
      if (options.interactive !== false && !options.config && 
          !options.temperature && !options.output && !options.count && !options.maxTokens) {
        const result = await configureParameters(config);
        
        if (result.action === 'cancel') {
          console.log(chalk.yellow('\nGeneration cancelled.'));
          return;
        }
        
        // Apply parameter overrides
        overrides = result.overrides;
        config = configManager.mergeConfigs(config, overrides);
        
        if (result.action === 'review') {
          // Continue to show configuration review below
        } else if (result.action === 'start') {
          // Skip configuration review and start generation directly
          const generator = new DataGenerator(config);
          await generator.generateAll();
          return;
        }
      }
      
      // Try to get user info
      const client = await createApiClient(config.api);
      const userInfo = await client.getUserInfo();
      
      // Display user info if available
      if (userInfo.success && userInfo.data?.data) {
        console.log(chalk.bold('\n👤 Account Info:'));
        const data = userInfo.data.data;
        
        // OpenRouter /auth/key endpoint format
        if (data.limit !== undefined && data.usage !== undefined) {
          const limit = parseFloat(data.limit);
          const usage = parseFloat(data.usage);
          const remaining = parseFloat(data.limit_remaining || (limit - usage));
          const percentUsed = limit > 0 ? (usage / limit * 100).toFixed(1) : 0;
          
          console.log(`  ${chalk.gray('balance')}: ${chalk.green(`$${remaining.toFixed(2)}`)} of $${limit.toFixed(2)} (${percentUsed}% used)`);
          console.log(`  ${chalk.gray('usage')}: ${chalk.yellow(`$${usage.toFixed(2)}`)}`);
          
          if (data.is_free_tier !== undefined) {
            console.log(`  ${chalk.gray('tier')}: ${data.is_free_tier ? chalk.cyan('Free') : chalk.yellow('Paid')}`);
          }
          
          if (data.rate_limit) {
            console.log(`  ${chalk.gray('rate limit')}: ${chalk.cyan(`${data.rate_limit.requests} requests per ${data.rate_limit.interval}`)}`);
          }
        }
      }
      
      console.log(chalk.bold('\n📋 Configuration:'));
      const info = configManager.getConfigInfo(config);
      
      // Basic info
      console.log(`  ${chalk.gray('name')}: ${chalk.white(info.name)}`);
      console.log(`  ${chalk.gray('version')}: ${chalk.white(info.version)}`);
      console.log(`  ${chalk.gray('model')}: ${chalk.white(info.model)}`);
      console.log(`  ${chalk.gray('temperature')}: ${chalk.white(info.temperature)}`);
      console.log(`  ${chalk.gray('max tokens')}: ${chalk.white(info.maxTokens)}`);
      console.log(`  ${chalk.gray('output path')}: ${chalk.white(info.outputPath)}`);
      
      // Calculate estimated cost
      const modelId = config.api?.model || 'openrouter/auto';
      
      if (modelId === 'openrouter/auto') {
        console.log(`  ${chalk.gray('estimated max cost')}: ${chalk.cyan('Variable (Auto Router)')}`);
      } else {
        const pricePerMillion = await getModelPrice(modelId);
        const estimatedCost = calculateEstimatedCost(pricePerMillion, info.tasks, info.maxTokens);
        
        if (pricePerMillion > 0) {
          console.log(`  ${chalk.gray('estimated max cost')}: ${chalk.yellow(`$${estimatedCost.toFixed(2)}`)}`);
        } else {
          console.log(`  ${chalk.gray('estimated max cost')}: ${chalk.green('Free')}`);
        }
      }
      
      // Task details
      if (info.tasks.length > 0) {
        console.log(`\n  ${chalk.gray('Tasks')} (${info.tasksCount}):`);
        info.tasks.forEach((task, i) => {
          const taskInfo = Object.entries(task)
            .filter(([k]) => k !== 'count')
            .map(([k, v]) => `${k}=${v}`)
            .join(', ');
          console.log(`    ${i + 1}. ${task.count} items: ${taskInfo}`);
        });
      }
      
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
      
      const client = await createApiClient({
        apiKey: options.apiKey
      });
      
      const result = await client.testConnection();
      
      if (result.connected) {
        spinner.succeed('Connected to OpenRouter successfully!');
        console.log(chalk.green(`\n✓ Total available models: ${result.models.length}`));
        
        // Try to get user info
        const userInfo = await client.getUserInfo();
        if (userInfo.success && userInfo.data?.data) {
          console.log(chalk.cyan('\n👤 Account Information:'));
          const data = userInfo.data.data;
          
          if (data.limit !== undefined && data.usage !== undefined) {
            const limit = parseFloat(data.limit);
            const usage = parseFloat(data.usage);
            const remaining = parseFloat(data.limit_remaining || (limit - usage));
            const percentUsed = limit > 0 ? (usage / limit * 100).toFixed(1) : 0;
            
            console.log(`  ${chalk.gray('Balance')}: ${chalk.green(`$${remaining.toFixed(2)}`)} of $${limit.toFixed(2)} (${percentUsed}% used)`);
            console.log(`  ${chalk.gray('API Key')}: ${data.label || 'Unknown'}`);
            console.log(`  ${chalk.gray('Tier')}: ${data.is_free_tier ? chalk.cyan('Free') : chalk.yellow('Paid')}`);
            
            if (data.rate_limit) {
              console.log(`  ${chalk.gray('Rate Limit')}: ${data.rate_limit.requests} requests per ${data.rate_limit.interval}`);
            }
          }
        }
        
        // Get detailed model info
        const models = await client.getModels();
        
        // Count free models
        const freeModels = models.filter(m => 
          parseFloat(m.pricing?.prompt || '0') === 0 || m.id.includes(':free')
        );
        
        console.log(chalk.cyan(`\n📊 Model Statistics:`));
        console.log(`  🆓 Free models: ${freeModels.length}`);
        console.log(`  💰 Paid models: ${models.length - freeModels.length}`);
        
        console.log(chalk.cyan(`\n🆓 Top Free Models:`));
        freeModels.slice(0, 10).forEach(m => {
          console.log(`  - ${m.name} (${m.id})`);
        });
        
        console.log(chalk.cyan(`\n💰 Popular Paid Models:`));
        const paidModels = models.filter(m => 
          !(parseFloat(m.pricing?.prompt || '0') === 0 || m.id.includes(':free')) &&
          (m.id.includes('gpt') || m.id.includes('claude') || m.id.includes('gemini'))
        );
        paidModels.slice(0, 10).forEach(m => {
          const pricePerMillion = parseFloat(m.pricing?.prompt || 0) * 1000000;
          console.log(`  - ${m.name} ($${pricePerMillion.toFixed(2)}/M tokens)`);
        });
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
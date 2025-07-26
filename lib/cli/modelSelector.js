import chalk from 'chalk';
import ora from 'ora';
import inquirer from 'inquirer';
import { createApiClient } from '../sessionManager.js';
import { 
  formatModelChoice, 
  createSeparatorChoice, 
  createBackChoice,
  displayAccountInfo 
} from './uiHelpers.js';

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
    createBackChoice(),
    createSeparatorChoice()
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
    createBackChoice(),
    createSeparatorChoice()
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
    choices.push(formatModelChoice(currentInFiltered, true));
    choices.push(createSeparatorChoice());
  }
  
  choices.push(
    createBackChoice(),
    createSeparatorChoice()
  );
  
  // Add filtered models (skip current if already shown)
  filteredModels.forEach(model => {
    if (model.id === currentModel) return; // Skip current model as it's already shown
    choices.push(formatModelChoice(model));
  });
  
  choices.push(createSeparatorChoice());
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
    const customModel = await promptCustomModel();
    if (customModel === null) {
      return showFilteredModels(models, filterType, currentModel); // Go back to filtered view
    }
    return customModel;
  }
  
  return model;
}

async function promptCustomModel() {
  const { customModel } = await inquirer.prompt([
    {
      type: 'input',
      name: 'customModel',
      message: 'Enter model name (e.g., openai/gpt-3.5-turbo) or "cancel" to go back:',
      validate: input => {
        if (input.trim() === '') return 'Model name cannot be empty';
        return true;
      }
    }
  ]);
  
  if (customModel.toLowerCase() === 'cancel') {
    return null; // Will be handled by the caller
  }
  
  return customModel;
}

async function showAllModels(models, currentModel) {
  const allChoices = [
    { name: '🤖 Auto Router (selects best available model)', value: 'openrouter/auto' }
  ];
  
  models.forEach(m => {
    allChoices.push(formatModelChoice(m));
  });
  
  allChoices.push({ name: '🔍 Enter manually...', value: 'other' });
  
  console.log('\n' + chalk.gray('Legend: 🆓=Free 💰=Paid | [context] | 🔧=functions 👁️=vision ⚡=streaming | MM/DD/YYYY'));
  
  const { allModel } = await inquirer.prompt([
    {
      type: 'list',
      name: 'allModel',
      message: 'Select LLM model (all models):',
      choices: allChoices,
      pageSize: Math.min(process.stdout.rows - 10, allChoices.length),
      loop: false,
      default: allChoices.findIndex(c => c.value === currentModel) || 0
    }
  ]);
  
  if (allModel === 'other') {
    const customModel = await promptCustomModel();
    if (customModel === null) {
      return selectModel(currentModel); // Go back to model selection
    }
    return customModel;
  }
  return allModel;
}

export async function selectModel(currentModel) {
  console.log(chalk.cyan(`\n🤖 Current model: ${currentModel}`));
  
  // Create client and fetch account info
  const client = await createApiClient();
  
  // Try to get and display user info first
  const userInfo = await client.getUserInfo();
  displayAccountInfo(userInfo);
  
  // Fetch models from API
  const spinner = ora('Fetching available models...').start();
  const models = await client.getModels();
  spinner.succeed('Fetched available models');
  
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
      choices.push(formatModelChoice(currentModelData, true));
      choices.push(createSeparatorChoice());
    } else {
      // Current model not found in list, add it as simple option
      choices.push({
        name: `✅ ${currentModel} (current)`,
        value: currentModel
      });
      choices.push(createSeparatorChoice());
    }
  }
  
  // Add auto router
  choices.push({ name: '🤖 Auto Router (selects best available model)', value: 'openrouter/auto' });
  
  // Use first 25 models
  const displayModels = models.slice(0, 25);
  
  // Add first 25 models with detailed info (skip current if already shown)
  displayModels.forEach(model => {
    if (currentModel && model.id === currentModel) return; // Skip current model as it's already shown
    choices.push(formatModelChoice(model));
  });
  
  // Add options for more models and filters
  choices.push(createSeparatorChoice());
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
  choices.push({ name: '❌ Cancel', value: 'cancel' });
  
  console.log('\n' + chalk.gray('Legend: 🆓=Free 💰=Paid | [context] | 🔧=functions 👁️=vision ⚡=streaming | MM/DD/YYYY'));
  
  const { model } = await inquirer.prompt([
    {
      type: 'list',
      name: 'model',
      message: 'Select LLM model (press Enter to keep current):',
      choices: choices,
      pageSize: Math.min(process.stdout.rows - 10, choices.length),
      loop: false,
      default: 0  // Default to first choice, which is the current model if it exists
    }
  ]);

  // Handle special actions
  if (model === 'cancel') {
    return null; // Return null to indicate cancellation
  }
  
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
    return showAllModels(models, currentModel);
  }
  
  if (model === 'other') {
    const customModel = await promptCustomModel();
    if (customModel === null) {
      return selectModel(currentModel); // Go back to model selection
    }
    return customModel;
  }

  return model;
}
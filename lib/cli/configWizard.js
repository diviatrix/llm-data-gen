import chalk from 'chalk';
import inquirer from 'inquirer';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function selectConfig(configManager) {
  console.log(chalk.cyan('\n📁 Select configuration:'));
  
  // Start at package's configs directory
  const packageConfigsPath = path.join(__dirname, '..', '..', 'configs');
  let currentPath = packageConfigsPath;
  let selectedConfig = null;
  
  while (!selectedConfig) {
    // Get files and directories in current path
    const items = [];
    try {
      const files = await fs.readdir(currentPath, { withFileTypes: true });
      
      // Always add back to main menu option first
      items.push({
        name: '⬅️  Back to main menu',
        value: { type: 'main_menu' }
      });
      
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
      if (selection.type === 'main_menu') {
        return null; // Return null to indicate going back to main menu
      } else if (selection.type === 'parent') {
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

export async function configureParameters(config) {
  console.log(chalk.cyan('\n⚙️  Configuration Parameters:'));
  console.log(chalk.gray('Press Enter to keep default values, or type "cancel" to go back'));
  
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
        if (input.toLowerCase() === 'cancel') return true;
        const num = parseFloat(input);
        return (!isNaN(num) && num >= 0 && num <= 2) || 'Temperature must be between 0 and 2';
      }
    }
  ]);
  
  // Check for cancellation
  if (temperature.toLowerCase() === 'cancel') {
    return { overrides: {}, action: 'cancel' };
  }
  
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
  
  // Ask if user wants to start generation
  const { action } = await inquirer.prompt([
    {
      type: 'list',
      name: 'action',
      message: 'What would you like to do?',
      choices: [
        { name: '🚀 Start generation', value: 'start' },
        { name: '⚙️  Modify parameters', value: 'modify' },
        { name: '❌ Cancel', value: 'cancel' }
      ]
    }
  ]);
  
  return { overrides, action };
}

export async function setupManualConfig() {
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
  console.log(chalk.gray('Type "cancel" at any time to exit setup'));
  
  const { name, description } = await inquirer.prompt([
    {
      type: 'input',
      name: 'name',
      message: 'Configuration name:',
      default: 'My Data Generator',
      validate: input => {
        if (input.trim().toLowerCase() === 'cancel') return true;
        if (input.trim() === '') return 'Name is required';
        return true;
      }
    },
    {
      type: 'input',
      name: 'description',
      message: 'Description (optional):'
    }
  ]);
  
  // Check for cancellation
  if (name.trim().toLowerCase() === 'cancel') {
    console.log(chalk.yellow('\nSetup cancelled.'));
    return null;
  }
  
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
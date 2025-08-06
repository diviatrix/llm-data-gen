import { chalk } from '../utils/colors.js';
import inquirer from 'inquirer';
import autocompletePrompt from 'inquirer-autocomplete-prompt';
import fs from 'node:fs/promises';
import path from 'node:path';
import { UserStorage } from '../userStorage.js';

// Register autocomplete prompt
inquirer.registerPrompt('autocomplete', autocompletePrompt);

// Available template variables for autocomplete
const TEMPLATE_VARIABLES = [
  'index', 'theme', 'topic', 'topic_translit', 'date', 'timestamp', 'now',
  'type', 'count', 'days', 'focus_areas'
];

function _createFieldDefinition(field) {
  let fieldDef;

  // Handle union types (e.g., "array|string" or "string|number|boolean")
  if (field.type.includes('|')) {
    const types = field.type.split('|').map(t => t.trim());
    fieldDef = {
      anyOf: types.map(type => ({ type: type }))
    };
  } else {
    fieldDef = { type: field.type };
  }

  // Add x-llm-generate configuration from generateConfig
  if (field.generateConfig) {
    fieldDef['x-llm-generate'] = { ...field.generateConfig };
  } else {
    // Fallback for backward compatibility
    if (field.template && field.template.trim()) {
      fieldDef['x-llm-generate'] = { template: field.template };
    } else {
      fieldDef['x-llm-generate'] = { prompt: field.prompt || 'Generate appropriate data' };
    }
  }

  // Special handling for array type
  if (field.type === 'array' || (field.type.includes('|') && field.type.includes('array'))) {
    // For union types containing array, we'll let the LLM decide the structure
    if (!field.type.includes('|')) {
      fieldDef.items = { type: 'string' };
    }

    // Add default array constraints if not specified in generateConfig
    if (!field.generateConfig?.minItems && !field.generateConfig?.maxItems) {
      if (!fieldDef['x-llm-generate'].minItems) {
        fieldDef['x-llm-generate'].minItems = 3;
      }
      if (!fieldDef['x-llm-generate'].maxItems) {
        fieldDef['x-llm-generate'].maxItems = 6;
      }
    }
  }

  return fieldDef;
}

function createAutocompleteSource(variables = TEMPLATE_VARIABLES) {
  return function (answers, input) {
    input = input || '';
    const lastBraceIndex = input.lastIndexOf('{');

    if (lastBraceIndex === -1) {
      return [];
    }

    const prefix = input.substring(lastBraceIndex + 1);
    const matches = variables.filter(v => v.startsWith(prefix));

    return matches.map(match => {
      const beforeBrace = input.substring(0, lastBraceIndex);
      return beforeBrace + '{' + match + '}';
    });
  };
}

function displayCurrentConfig(config, highlightedField = null, clearScreen = false) {
  if (clearScreen) {
    // Очищаем экран и возвращаем курсор в начало
    process.stdout.write('\x1B[2J\x1B[H');
  } else {
    // Просто добавляем отступ для визуального разделения
    console.log();
  }

  console.log(chalk.bgBlue.white.bold(' 📋 Current Configuration '));
  console.log(chalk.gray('┌─────────────────────────────────────────────────────────┐'));

  // Meta section
  const metaLine = `│ 📝 Name: ${(config.meta?.name || 'Not set').padEnd(43)} │`;
  console.log(highlightedField === 'meta.name' ? chalk.yellow(metaLine) : chalk.white(metaLine));

  // API section
  const modelLine = `│ 🤖 Model: ${(config.api?.model || 'openrouter/auto').padEnd(41)} │`;
  console.log(highlightedField === 'api.model' ? chalk.yellow(modelLine) : chalk.white(modelLine));

  const tempLine = `│ 🌡️  Temperature: ${(config.api?.temperature || 0.7).toString().padEnd(35)} │`;
  console.log(highlightedField === 'api.temperature' ? chalk.yellow(tempLine) : chalk.white(tempLine));

  // Schema section
  const propsCount = Object.keys(config.schema?.properties || {}).length;
  const actualFieldsCount = config.schema?.properties?.items?.items?.properties ?
    Object.keys(config.schema.properties.items.items.properties).length : propsCount;
  const schemaLine = `│ 📊 Schema fields: ${actualFieldsCount.toString().padEnd(35)} │`;
  console.log(highlightedField === 'schema' ? chalk.yellow(schemaLine) : chalk.white(schemaLine));

  // Generation section
  const tasksCount = config.generation?.tasks?.length || 0;
  const tasksLine = `│ 🎯 Generation tasks: ${tasksCount.toString().padEnd(31)} │`;
  console.log(highlightedField === 'generation.tasks' ? chalk.yellow(tasksLine) : chalk.white(tasksLine));

  // Output section
  const outputLine = `│ 📁 Output: ${(config.output?.outputPath || './output/').padEnd(40)} │`;
  console.log(highlightedField === 'output.outputPath' ? chalk.yellow(outputLine) : chalk.white(outputLine));

  console.log(chalk.gray('└─────────────────────────────────────────────────────────┘'));

  if (highlightedField) {
    console.log(chalk.yellow(`↑ Updating: ${highlightedField}`));
  }
  console.log(); // Добавить пустую строку для разделения
}

export async function selectConfig(_configManager) {
  console.log(chalk.cyan('\n📁 Select configuration:'));

  const userConfigsPath = UserStorage.getUserConfigsDir(0);
  let currentPath = userConfigsPath;
  let selectedConfig = null;

  while (!selectedConfig) {
    const items = [];
    try {
      const files = await fs.readdir(currentPath, { withFileTypes: true });

      items.push({
        name: '⬅️  Back',
        value: { type: 'back' }
      });

      if (currentPath !== userConfigsPath) {
        items.push({
          name: '⬆️  .. (parent directory)',
          value: { type: 'parent' }
        });
      }

      const sorted = files.sort((a, b) => {
        if (a.isDirectory() && !b.isDirectory()) return -1;
        if (!a.isDirectory() && b.isDirectory()) return 1;
        return a.name.localeCompare(b.name);
      });

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
        if (currentPath !== userConfigsPath) {
          currentPath = path.dirname(currentPath);
          continue;
        } else {
          throw new Error('No configuration files found');
        }
      }

      const displayPath = path.relative(UserStorage.getUserBaseDir(0), currentPath) || 'llmdatagen';
      console.log(chalk.gray(`Current path: ${displayPath}`));

      const { selection } = await inquirer.prompt([
        {
          type: 'list',
          name: 'selection',
          message: 'Choose configuration or navigate:',
          choices: items,
          default: items.findIndex(item => item.value?.name === 'default.json') || 0
        }
      ]);

      if (selection.type === 'back') {
        return null;
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
  const overrides = {};

  let action;
  let setupCompleted = false;

  while (!setupCompleted) {
    // Show current configuration
    displayCurrentConfig(config);

    const { selectedAction } = await inquirer.prompt([
      {
        type: 'list',
        name: 'selectedAction',
        message: 'What would you like to do?',
        choices: [
          { name: '⬅️  Back', value: 'back' },
          { name: '🚀 Start generation', value: 'start' },
          { name: '🎯 Setup Tasks', value: 'setup_tasks' }
        ]
      }
    ]);

    if (selectedAction === 'setup_tasks') {
      const updatedTasks = await setupGenerationTasks(config);
      if (updatedTasks) {
        overrides.generation = { tasks: updatedTasks };
        config.generation.tasks = updatedTasks;
        console.log(chalk.green(`✅ Updated ${updatedTasks.length} generation tasks`));
      }
    } else {
      action = selectedAction;
      setupCompleted = true;
    }
  }

  return { overrides, action };
}

export async function setupManualConfig() {
  const config = {
    meta: {},
    api: {
      provider: 'openrouter',
      model: 'openrouter/auto',
      temperature: 0.7,
      maxTokens: 4000
    },
    output: {
      type: 'array',
      outputPath: './output/',
      fileNameTemplate: 'data_{timestamp}.json'
    },
    schema: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {},
            required: []
          }
        }
      }
    },
    prompts: {
      system: 'You are a helpful data generator. Generate data according to the schema requirements. Return only valid JSON.'
    },
    generation: { tasks: [] }
  };

  console.log(chalk.cyan('🛠️  Manual Configuration Setup'));
  console.log(chalk.gray('Press Ctrl+C at any time to cancel\n'));

  // 📝 Basic Information
  console.log(chalk.yellow('📝 Basic Information:'));

  const { name } = await inquirer.prompt([
    {
      type: 'input',
      name: 'name',
      message: 'Configuration name:',
      default: 'My Data Generator',
      validate: input => {
        if (input.trim() === '') return 'Name is required';
        return true;
      }
    }
  ]);

  // Update config and show the change
  config.meta.name = name;
  config.meta.version = '1.0';

  // Show updated config (clear screen for first major update)
  displayCurrentConfig(config, null, true);

  const { description } = await inquirer.prompt([
    {
      type: 'input',
      name: 'description',
      message: 'Description (optional):'
    }
  ]);

  if (description) {
    config.meta.description = description;
  }

  // 🤖 System Prompt
  console.log(chalk.yellow('🤖 System Prompt:'));
  const { systemPrompt } = await inquirer.prompt([
    {
      type: 'input',
      name: 'systemPrompt',
      message: 'System prompt for the LLM:',
      default: 'You are a helpful assistant that generates structured JSON data according to the provided schema.'
    }
  ]);
  config.prompts.system = systemPrompt;

  // 📁 Output Settings
  console.log(chalk.yellow('📁 Output Settings:'));

  const { format } = await inquirer.prompt([
    {
      type: 'list',
      name: 'format',
      message: 'Output format:',
      choices: [
        { name: '📄 JSON - Structured data', value: 'json' },
        { name: '📝 Text - Markdown/Plain text', value: 'text' }
      ]
    }
  ]);

  const { outputPath, fileNameTemplate } = await inquirer.prompt([
    {
      type: 'input',
      name: 'outputPath',
      message: 'Output directory:',
      default: './output/',
      validate: input => input.trim() !== '' || 'Output path is required'
    },
    {
      type: 'input',
      name: 'fileNameTemplate',
      message: 'Filename template (available: {index}, {theme}, {topic}, {topic_translit}, {date}, {timestamp}):',
      default: format === 'text' ? '{topic_translit}_{index}.md' : 'data_{timestamp}.json',
      validate: input => input.trim() !== '' || 'Filename template is required'
    }
  ]);

  if (format === 'text') {
    config.output.format = 'text';
    config.output.fileExtension = fileNameTemplate.includes('.md') ? '.md' : '.txt';
    delete config.schema.properties.items; // Remove items wrapper for text format
    config.schema = { type: 'object', properties: {} };
  }

  config.output.outputPath = outputPath;
  config.output.fileNameTemplate = fileNameTemplate;

  // 📋 Data Schema
  console.log(chalk.yellow('📋 Data Schema:'));

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
    const fields = [];
    let addMore = true;

    const targetSchema = config.output.format === 'text' ? config.schema : config.schema.properties.items.items;

    while (addMore) {
      // Show current schema progress
      console.log(chalk.gray('Add a field to your schema:'));

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
          choices: [
            'string',
            'number',
            'integer',
            'boolean',
            'array',
            'object',
            { name: 'array | string (flexible type)', value: 'array|string' },
            { name: 'string | number (flexible type)', value: 'string|number' },
            { name: 'custom union type...', value: 'custom_union' }
          ]
        },
        {
          type: 'list',
          name: 'generationMethod',
          message: 'How should this field be generated?',
          choices: [
            { name: 'Template (e.g. "{topic}_{index}")', value: 'template' },
            { name: 'Prompt (LLM generates based on description)', value: 'prompt' },
            { name: 'Value (direct substitution from context)', value: 'value' },
            { name: 'Advanced (set all parameters)', value: 'advanced' }
          ]
        }
      ]);

      // Handle custom union type
      if (field.type === 'custom_union') {
        const { customTypes } = await inquirer.prompt([
          {
            type: 'input',
            name: 'customTypes',
            message: 'Enter types separated by | (e.g., string|number|boolean):',
            validate: input => {
              if (!input.trim()) return 'Types are required';
              const types = input.split('|').map(t => t.trim());
              const validTypes = ['string', 'number', 'integer', 'boolean', 'array', 'object', 'null'];
              const invalidTypes = types.filter(t => !validTypes.includes(t));
              if (invalidTypes.length > 0) {
                return `Invalid types: ${invalidTypes.join(', ')}. Valid types: ${validTypes.join(', ')}`;
              }
              return true;
            }
          }
        ]);
        field.type = customTypes;
      }

      // Handle generation method
      field.generateConfig = await _getGenerationConfig(field.generationMethod, field.type);

      fields.push(field);

      // Update schema immediately to show progress
      const fieldDef = _createFieldDefinition(field);
      targetSchema.properties[field.name] = fieldDef;

      // Show updated config after adding field (inline update without clearing)
      displayCurrentConfig(config);

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

    targetSchema.required = fields.map(f => f.name);

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

  // 🎯 Generation Tasks - use the reusable setupGenerationTasks function
  const tasks = await setupGenerationTasks(config);
  if (tasks) {
    config.generation.tasks = tasks;
  }

  // Show final configuration
  displayCurrentConfig(config);
  console.log(chalk.green('✅ Configuration Complete!'));

  const { saveConfig } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'saveConfig',
      message: 'Would you like to save this configuration for future use?',
      default: true
    }
  ]);

  if (saveConfig) {
    const defaultFilename = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') + '.json';
    const { savePath } = await inquirer.prompt([
      {
        type: 'input',
        name: 'savePath',
        message: 'Save configuration as (filename):',
        default: defaultFilename,
        validate: input => {
          if (!input.trim()) return 'Filename is required';
          if (!input.endsWith('.json')) return 'Filename must end with .json';
          return true;
        }
      }
    ]);

    try {
      // Ensure we save to user config directory
      const userConfigsDir = UserStorage.getUserConfigsDir(0);
      const filename = path.basename(savePath);
      const fullSavePath = path.isAbsolute(savePath) ? savePath : path.join(userConfigsDir, filename);

      const dir = path.dirname(fullSavePath);
      await fs.mkdir(dir, { recursive: true });

      await fs.writeFile(fullSavePath, JSON.stringify(config, null, 2));
      console.log(chalk.green(`✓ Configuration saved to ${fullSavePath}`));
    } catch (error) {
      console.log(chalk.red(`Failed to save configuration: ${error.message}`));
    }
  }

  return config;
}

export async function setupGenerationTasks(config) {
  console.log(chalk.cyan('\n🎯 Setup Generation Tasks'));
  console.log(chalk.gray('Configure what data to generate and how many items per task\n'));

  // Show current tasks if any
  if (config.generation?.tasks?.length > 0) {
    console.log(chalk.yellow('Current tasks:'));
    config.generation.tasks.forEach((task, index) => {
      console.log(chalk.gray(`  ${index + 1}. ${task.theme || task.topic} (${task.count} items)`));
    });
    console.log();
  }

  const { clearExisting } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'clearExisting',
      message: 'Clear existing tasks and start fresh?',
      default: true
    }
  ]);

  const tasks = clearExisting ? [] : [...(config.generation?.tasks || [])];
  let addingTasks = true;

  while (addingTasks && tasks.length < 10) {
    console.log(chalk.yellow(`\n📝 Task ${tasks.length + 1}:`));

    const task = await inquirer.prompt([
      {
        type: 'input',
        name: 'theme',
        message: 'Theme/Topic for this task:',
        validate: input => input.trim() !== '' || 'Theme is required'
      },
      {
        type: 'input',
        name: 'count',
        message: 'How many items to generate for this task:',
        default: '5',
        validate: input => {
          const num = parseInt(input);
          return (!isNaN(num) && num > 0 && num <= 100) || 'Must be between 1 and 100';
        }
      }
    ]);

    // Check if this is a text format config to add userPrompt
    if (config.output?.format === 'text') {
      const { customPrompt } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'customPrompt',
          message: 'Use custom prompt for this task?',
          default: false
        }
      ]);

      if (customPrompt) {
        const { userPrompt } = await inquirer.prompt([
          {
            type: 'input',
            name: 'userPrompt',
            message: 'Custom prompt template:',
            default: 'Write about {theme}. Make it informative and engaging.',
            validate: input => input.trim() !== '' || 'Prompt is required'
          }
        ]);
        task.userPrompt = userPrompt;
      }
    }

    // Add optional parameters
    const { addMoreParams } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'addMoreParams',
        message: 'Add optional parameters for this task?',
        default: false
      }
    ]);

    if (addMoreParams) {
      const additionalParams = await inquirer.prompt([
        {
          type: 'input',
          name: 'focus_areas',
          message: 'Focus areas (comma-separated, optional):',
          filter: input => input.trim() ? input.split(',').map(s => s.trim()) : undefined
        },
        {
          type: 'input',
          name: 'days',
          message: 'Time period in days (optional):',
          validate: input => {
            if (input === '') return true;
            const num = parseInt(input);
            return (!isNaN(num) && num > 0) || 'Must be a positive number';
          },
          filter: input => input ? parseInt(input) : undefined
        },
        {
          type: 'input',
          name: 'type',
          message: 'Content type (optional):',
          filter: input => input.trim() || undefined
        }
      ]);

      // Add non-empty additional parameters
      Object.keys(additionalParams).forEach(key => {
        if (additionalParams[key] !== undefined) {
          task[key] = additionalParams[key];
        }
      });
    }

    // Convert count to number and add topic alias for compatibility
    task.count = parseInt(task.count);
    task.topic = task.theme; // Add topic alias for backward compatibility

    tasks.push(task);

    // Show updated task list
    console.log(chalk.green(`✅ Added task: ${task.theme} (${task.count} items)`));

    if (tasks.length < 10) {
      const { continueAdding } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'continueAdding',
          message: 'Add another task?',
          default: tasks.length < 3
        }
      ]);
      addingTasks = continueAdding;
    }
  }

  if (tasks.length === 0) {
    console.log(chalk.yellow('No tasks configured. Keeping existing tasks.'));
    return null;
  }

  // Show final summary
  console.log(chalk.cyan('\n📋 Task Summary:'));
  let totalItems = 0;
  tasks.forEach((task, index) => {
    console.log(chalk.white(`  ${index + 1}. ${task.theme} (${task.count} items)`));
    totalItems += task.count;
  });
  console.log(chalk.gray(`\nTotal items to generate: ${totalItems}`));

  const { confirmTasks } = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirmTasks',
      message: 'Save these tasks?',
      default: true
    }
  ]);

  return confirmTasks ? tasks : null;
}

async function _getGenerationConfig(method, fieldType) {
  const config = {};

  switch (method) {
  case 'template': {
    const { template } = await inquirer.prompt([
      {
        type: 'autocomplete',
        name: 'template',
        message: 'Template (use {variable} syntax):',
        source: createAutocompleteSource(),
        validate: input => input.trim() !== '' || 'Template is required'
      }
    ]);
    config.template = template;
    break;
  }

  case 'prompt': {
    const { prompt } = await inquirer.prompt([
      {
        type: 'input',
        name: 'prompt',
        message: 'Prompt for LLM:',
        validate: input => input.trim() !== '' || 'Prompt is required'
      }
    ]);
    config.prompt = prompt;

    // Ask for length constraints
    const { minLength, maxLength } = await inquirer.prompt([
      {
        type: 'input',
        name: 'minLength',
        message: 'Minimum length (optional):',
        validate: input => {
          if (input === '') return true;
          const num = parseInt(input);
          return (!isNaN(num) && num > 0) || 'Must be a positive number';
        }
      },
      {
        type: 'input',
        name: 'maxLength',
        message: 'Maximum length (optional):',
        validate: input => {
          if (input === '') return true;
          const num = parseInt(input);
          return (!isNaN(num) && num > 0) || 'Must be a positive number';
        }
      }
    ]);

    if (minLength) config.minLength = parseInt(minLength);
    if (maxLength) config.maxLength = parseInt(maxLength);

    // For array types, ask for item constraints
    if (fieldType.includes('array')) {
      const { minItems, maxItems } = await inquirer.prompt([
        {
          type: 'input',
          name: 'minItems',
          message: 'Minimum items (optional):',
          validate: input => {
            if (input === '') return true;
            const num = parseInt(input);
            return (!isNaN(num) && num >= 0) || 'Must be 0 or positive number';
          }
        },
        {
          type: 'input',
          name: 'maxItems',
          message: 'Maximum items (optional):',
          validate: input => {
            if (input === '') return true;
            const num = parseInt(input);
            return (!isNaN(num) && num > 0) || 'Must be a positive number';
          }
        }
      ]);

      if (minItems) config.minItems = parseInt(minItems);
      if (maxItems) config.maxItems = parseInt(maxItems);
    }

    // Ask for requirements
    const { addRequirements } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'addRequirements',
        message: 'Add specific requirements?',
        default: false
      }
    ]);

    if (addRequirements) {
      const requirements = [];
      let addMore = true;

      while (addMore && requirements.length < 5) {
        const { requirement } = await inquirer.prompt([
          {
            type: 'input',
            name: 'requirement',
            message: `Requirement ${requirements.length + 1}:`,
            validate: input => input.trim() !== '' || 'Requirement is required'
          }
        ]);
        requirements.push(requirement);

        if (requirements.length < 5) {
          const { continueAdding } = await inquirer.prompt([
            {
              type: 'confirm',
              name: 'continueAdding',
              message: 'Add another requirement?',
              default: false
            }
          ]);
          addMore = continueAdding;
        }
      }

      config.requirements = requirements;
    }
    break;
  }

  case 'value': {
    const { value } = await inquirer.prompt([
      {
        type: 'autocomplete',
        name: 'value',
        message: 'Direct value (use {variable} syntax):',
        source: createAutocompleteSource(),
        validate: input => input.trim() !== '' || 'Value is required'
      }
    ]);
    config.value = value;
    break;
  }

  case 'advanced': {
    console.log(chalk.yellow('Advanced configuration - set all parameters:'));

    const { configType } = await inquirer.prompt([
      {
        type: 'list',
        name: 'configType',
        message: 'Primary generation method:',
        choices: [
          { name: 'Template-based', value: 'template' },
          { name: 'Prompt-based', value: 'prompt' },
          { name: 'Direct value', value: 'value' }
        ]
      }
    ]);

    // Get primary config
    const primaryConfig = await _getGenerationConfig(configType, fieldType);
    Object.assign(config, primaryConfig);

    // Add description
    const { description } = await inquirer.prompt([
      {
        type: 'input',
        name: 'description',
        message: 'Description (optional):'
      }
    ]);
    if (description) config.description = description;

    // For number/integer types, add range support
    if (fieldType.includes('number') || fieldType.includes('integer')) {
      const { addRange } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'addRange',
          message: 'Add numeric range?',
          default: false
        }
      ]);

      if (addRange) {
        const { minRange, maxRange } = await inquirer.prompt([
          {
            type: 'input',
            name: 'minRange',
            message: 'Minimum value:',
            validate: input => {
              if (input === '') return true;
              const num = parseFloat(input);
              return !isNaN(num) || 'Must be a number';
            }
          },
          {
            type: 'input',
            name: 'maxRange',
            message: 'Maximum value:',
            validate: input => {
              if (input === '') return true;
              const num = parseFloat(input);
              return !isNaN(num) || 'Must be a number';
            }
          }
        ]);

        const range = [];
        if (minRange !== '') range.push(parseFloat(minRange));
        if (maxRange !== '') range.push(parseFloat(maxRange));
        if (range.length > 0) config.range = range;
      }
    }

    // Add mapping support
    const { addMapping } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'addMapping',
        message: 'Add value mapping?',
        default: false
      }
    ]);

    if (addMapping) {
      console.log(chalk.gray('Enter key-value pairs (e.g., "easy": 1, "medium": 2)'));
      const { mappingJson } = await inquirer.prompt([
        {
          type: 'editor',
          name: 'mappingJson',
          message: 'Mapping object (JSON):'
        }
      ]);

      try {
        const mapping = JSON.parse(`{${mappingJson}}`);
        config.mapping = mapping;
      } catch (error) {
        console.log(chalk.red('Invalid JSON mapping, skipping...'));
      }
    }

    // Add count parameter
    const { count } = await inquirer.prompt([
      {
        type: 'input',
        name: 'count',
        message: 'Count parameter (optional, can use {variable}):',
        default: ''
      }
    ]);
    if (count) config.count = count;

    break;
  }
  }

  return config;
}

import path from 'path';
import { fileURLToPath } from 'url';
import { execSync, spawn } from 'child_process';
import { selectModel } from './modelSelector.js';
import { selectConfig, configureParameters, setupManualConfig } from './configWizard.js';
import { createApiClient } from '../sessionManager.js';
import { DataGenerator } from '../generator.js';
import { testConnection } from './commands.js';
import { UserStorage } from '../userStorage.js';
import * as console from '../utils/console.js';
import { handleError } from '../utils/errors.js';
import chalk from 'chalk';

async function showMainMenu() {
  const inquirer = (await import('inquirer')).default;

  const { action } = await inquirer.prompt([{
    type: 'list',
    name: 'action',
    message: 'What would you like to do?',
    choices: [
      { name: '🚀 Generate data', value: 'generate' },
      { name: '⚙️  Create/edit configuration', value: 'config' },
      { name: '🌐 Open web interface', value: 'web' },
      { name: '📊 Test API connection', value: 'test' },
      { name: '📂 Open data folder', value: 'open_folder' },
      { name: '❌ Exit', value: 'exit' }
    ]
  }]);

  return action;
}

export async function runInteractiveMode(configManager, options = {}) {
  // Handle process interruption gracefully
  let isExiting = false;

  const handleExit = () => {
    if (!isExiting) {
      isExiting = true;
      console.info('\nGoodbye!');
      process.exit(0);
    }
  };

  process.on('SIGINT', handleExit);
  process.on('SIGTERM', handleExit);

  try {
    console.header(`LLM Data Generator v${options.version || '1.0.0'}`);

    // Show account info once at startup
    try {
      const client = await createApiClient();
      const userInfo = await client.getUserInfo();

      if (userInfo.success && userInfo.data?.data) {
        const data = userInfo.data.data;
        if (data.limit !== undefined && data.usage !== undefined) {
          const limit = parseFloat(data.limit);
          const usage = parseFloat(data.usage);
          const remaining = parseFloat(data.limit_remaining || (limit - usage));
          const percentUsed = limit > 0 ? (usage / limit * 100).toFixed(1) : 0;

          console.section('Account Info', '👤');
          console.keyValue('balance', `$${remaining.toFixed(2)} of $${limit.toFixed(2)} (${percentUsed}% used)`);
        }
      }
    } catch (error) {
      // Ignore API errors at startup
    }

    // Main menu loop
    let isRunning = true;
    while (isRunning) {
      const action = await showMainMenu();

      if (action === 'exit') {
        isExiting = true;
        isRunning = false;
        console.info('Goodbye!');
        break;
      }

      if (action === 'generate') {
        await runGenerateFlow(configManager);
      } else if (action === 'config') {
        await runConfigFlow(configManager);
      } else if (action === 'web') {
        await startWebInterface();
      } else if (action === 'test') {
        await testConnection({});
      } else if (action === 'open_folder') {
        await openDataFolder();
      }
    }

  } catch (error) {
    if (!isExiting) {
      handleError(error);
    }
  } finally {
    // Clean up event listeners
    process.removeListener('SIGINT', handleExit);
    process.removeListener('SIGTERM', handleExit);
  }
}

async function runGenerateFlow(configManager) {
  try {
    const configPath = await selectConfig(configManager);
    if (!configPath) return; // User clicked back

    // Load the actual configuration
    const config = await configManager.loadConfig(configPath);

    const selectedModel = await selectModel(config.api?.model);
    if (!selectedModel) {
      console.info('Model selection cancelled.');
      return;
    }

    config.api = config.api || {};
    config.api.model = selectedModel;

    const result = await configureParameters(config);
    if (!result || result.action === 'back') return;

    // Apply overrides
    const configuredConfig = { ...config, ...result.overrides };

    let generator;
    try {
      generator = new DataGenerator(configuredConfig);
    } catch (error) {
      if (error.code === 'SCHEMA_ERROR') {
        console.error(`\n❌ Configuration Error: ${error.message}`);
        console.info('\nPlease fix the configuration file and try again.');
        if (configPath) {
          console.info(`Configuration file: ${configPath}`);
        }
        return;
      }
      throw error;
    }

    await generator.generateAll();

    if (generator.errors.length > 0) {
      console.error('\nSome errors occurred during generation:');
      generator.errors.forEach(err => {
        console.error(`- ${err.error}`);
      });
    }

    console.success(`\nGeneration complete! Generated ${generator.generatedCount} items.`);
    if (generator.totalCost > 0) {
      console.info(`Total cost: ${console.cost(generator.totalCost)}`);
    }

  } catch (error) {
    handleError(error);
  }
}

async function runConfigFlow(configManager) {
  try {
    const inquirer = (await import('inquirer')).default;

    const { action } = await inquirer.prompt([{
      type: 'list',
      name: 'action',
      message: 'Configuration management:',
      choices: [
        { name: '⬅️  Back', value: 'back' },
        { name: '➕ Create new configuration', value: 'create' },
        { name: '✏️  Edit existing configuration', value: 'edit' },
        { name: '🔄 Clone existing configuration', value: 'clone' }
      ]
    }]);

    if (action === 'back') {
      return; // Return to main menu
    }

    if (action === 'create') {
      await createNewConfig(configManager);
    } else if (action === 'edit') {
      await editExistingConfig(configManager);
    } else if (action === 'clone') {
      await cloneExistingConfig(configManager);
    }

  } catch (error) {
    handleError(error);
  }
}

async function createNewConfig(configManager) {
  try {
    const inquirer = (await import('inquirer')).default;

    const { method } = await inquirer.prompt([{
      type: 'list',
      name: 'method',
      message: 'How would you like to create the configuration?',
      choices: [
        { name: '⬅️  Back', value: 'back' },
        { name: '🏗️  Create from template (basic, advanced)', value: 'template' },
        { name: '🛠️  Manual setup (guided wizard)', value: 'manual' }
      ]
    }]);

    if (method === 'back') {
      return await runConfigFlow(configManager);
    }

    if (method === 'template') {
      await createFromTemplate(configManager);
    } else if (method === 'manual') {
      const manualConfig = await setupManualConfig();
      console.success('\n✅ Configuration created successfully!');

      // Ask if user wants to use it immediately
      const { useNow } = await inquirer.prompt([{
        type: 'confirm',
        name: 'useNow',
        message: 'Would you like to use this configuration to generate data now?',
        default: true
      }]);

      if (useNow) {
        await runGenerateFlowWithConfig(manualConfig, null);
      }
    }

  } catch (error) {
    handleError(error);
  }
}

async function createFromTemplate(configManager) {
  try {
    const inquirer = (await import('inquirer')).default;

    const { template } = await inquirer.prompt([{
      type: 'list',
      name: 'template',
      message: 'Choose template type:',
      choices: [
        { name: '⬅️  Back', value: 'back' },
        { name: '📝 Basic - Simple JSON data generation', value: 'basic' },
        { name: '🚀 Advanced - Complex schema with multiple tasks', value: 'advanced' }
      ]
    }]);

    if (template === 'back') {
      return await createNewConfig(configManager);
    }

    const defaultFilename = `${template}-config.json`;
    const { outputPath } = await inquirer.prompt([{
      type: 'input',
      name: 'outputPath',
      message: 'Save configuration as (filename):',
      default: defaultFilename,
      validate: input => {
        if (!input.trim()) return 'Filename is required';
        if (!input.endsWith('.json')) return 'Filename must end with .json';
        return true;
      }
    }]);

    const config = await configManager.createExampleConfig(template);

    // Ensure we save to user config directory
    const userConfigsDir = UserStorage.getUserConfigsDir(0);
    const filename = path.basename(outputPath);
    const fullSavePath = path.isAbsolute(outputPath) ? outputPath : path.join(userConfigsDir, filename);

    await configManager.saveConfig(config, fullSavePath);

    console.success(`\n✅ ${template} configuration created at ${fullSavePath}`);

    // Ask if user wants to use it immediately
    const { useNow } = await inquirer.prompt([{
      type: 'confirm',
      name: 'useNow',
      message: 'Would you like to use this configuration to generate data now?',
      default: true
    }]);

    if (useNow) {
      await runGenerateFlowWithConfig(config, fullSavePath);
    }

  } catch (error) {
    handleError(error);
  }
}

async function editExistingConfig(configManager) {
  try {
    const configPath = await selectConfig(configManager);
    if (!configPath) return; // User clicked back

    await configManager.loadConfig(configPath);
    console.info('\n⚙️  Configuration editing will be implemented in a future version.');
    console.info('For now, you can:');
    console.info(`  - Edit the file directly: ${configPath}`);
    console.info('  - Create a new configuration based on this one');

  } catch (error) {
    handleError(error);
  }
}

async function cloneExistingConfig(configManager) {
  try {
    const configPath = await selectConfig(configManager);
    if (!configPath) return; // User clicked back

    const config = await configManager.loadConfig(configPath);

    const inquirer = (await import('inquirer')).default;
    const defaultFilename = `${(config.meta?.name || 'cloned').toLowerCase().replace(/\s+/g, '-')}-copy.json`;
    const { newName, outputPath } = await inquirer.prompt([
      {
        type: 'input',
        name: 'newName',
        message: 'Name for the new configuration:',
        default: `${config.meta?.name || 'Cloned'} - Copy`,
        validate: input => input.trim() !== '' || 'Name is required'
      },
      {
        type: 'input',
        name: 'outputPath',
        message: 'Save cloned configuration as (filename):',
        default: defaultFilename,
        validate: input => {
          if (!input.trim()) return 'Filename is required';
          if (!input.endsWith('.json')) return 'Filename must end with .json';
          return true;
        }
      }
    ]);

    // Update metadata
    const clonedConfig = JSON.parse(JSON.stringify(config));
    clonedConfig.meta = clonedConfig.meta || {};
    clonedConfig.meta.name = newName;
    clonedConfig.meta.clonedFrom = configPath;
    clonedConfig.meta.clonedAt = new Date().toISOString();

    // Ensure we save to user config directory
    const userConfigsDir = UserStorage.getUserConfigsDir(0);
    const filename = path.basename(outputPath);
    const fullSavePath = path.isAbsolute(outputPath) ? outputPath : path.join(userConfigsDir, filename);

    await configManager.saveConfig(clonedConfig, fullSavePath);
    console.success(`\n✅ Configuration cloned to ${fullSavePath}`);

    // Ask if user wants to use it immediately
    const { useNow } = await inquirer.prompt([{
      type: 'confirm',
      name: 'useNow',
      message: 'Would you like to use this cloned configuration to generate data now?',
      default: true
    }]);

    if (useNow) {
      await runGenerateFlowWithConfig(clonedConfig, fullSavePath);
    }

  } catch (error) {
    handleError(error);
  }
}

async function runGenerateFlowWithConfig(config, configPath = null) {
  try {
    const selectedModel = await selectModel(config.api?.model);
    if (!selectedModel) {
      console.info('Model selection cancelled.');
      return;
    }

    config.api = config.api || {};
    config.api.model = selectedModel;

    const result = await configureParameters(config);
    if (!result || result.action === 'back') return;

    // Apply overrides
    const configuredConfig = { ...config, ...result.overrides };

    let generator;
    try {
      generator = new DataGenerator(configuredConfig);
    } catch (error) {
      if (error.code === 'SCHEMA_ERROR') {
        console.error(`\n❌ Configuration Error: ${error.message}`);
        console.info('\nPlease fix the configuration file and try again.');
        if (configPath) {
          console.info(`Configuration file: ${configPath}`);
        }
        return;
      }
      throw error;
    }

    await generator.generateAll();

    if (generator.errors.length > 0) {
      console.error('\nSome errors occurred during generation:');
      generator.errors.forEach(err => {
        console.error(`- ${err.error}`);
      });
    }

    console.success(`\nGeneration complete! Generated ${generator.generatedCount} items.`);
    if (generator.totalCost > 0) {
      console.info(`Total cost: ${console.cost(generator.totalCost)}`);
    }

  } catch (error) {
    handleError(error);
  }
}

async function openDataFolder() {
  try {
    const dataDir = UserStorage.getUserBaseDir(0);
    console.info(`Opening data folder: ${dataDir}`);

    // Ensure the directory exists
    await UserStorage.ensureUserStructure(0);

    // Open in system file manager
    const platform = process.platform;
    try {
      if (platform === 'win32') {
        execSync(`explorer "${dataDir}"`, { stdio: 'ignore' });
      } else if (platform === 'darwin') {
        execSync(`open "${dataDir}"`, { stdio: 'ignore' });
      } else {
        // Linux and other Unix systems
        try {
          execSync(`xdg-open "${dataDir}"`, { stdio: 'ignore' });
        } catch {
          // Fallback for systems without xdg-open
          execSync(`nautilus "${dataDir}"`, { stdio: 'ignore' });
        }
      }
      console.success('Data folder opened in file manager!');
    } catch (error) {
      // Even if execSync throws an error, the folder might have opened successfully
      // This is common with Windows Explorer
      console.success('Data folder opened in file manager!');
      console.info(`If the folder didn't open, navigate to: ${dataDir}`);
    }
  } catch (error) {
    console.warning('Could not open file manager automatically.');
    console.info(`Please navigate to: ${UserStorage.getUserBaseDir(0)}`);
  }
}

async function startWebInterface() {
  console.info(chalk.cyan('\n🚀 Starting LLM Data Generator Web UI...\n'));

  const port = process.env.PORT || 3000;

  // Start the web server
  const serverPath = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'server.js');
  const serverProcess = spawn('node', [serverPath], {
    stdio: 'inherit',
    env: { ...process.env, PORT: port },
    cwd: path.dirname(serverPath)
  });

  // Open browser after a short delay
  setTimeout(() => {
    const url = `http://localhost:${port}`;
    console.info(chalk.green(`\n✅ Web UI available at: ${url}`));
    console.info(chalk.gray('Press Ctrl+C to stop the server and return to menu\n'));

    // Try to open browser
    const platform = process.platform;
    const openCommand = platform === 'darwin' ? 'open' : platform === 'win32' ? 'start' : 'xdg-open';
    spawn(openCommand, [url], { shell: true, detached: true });
  }, 2000);

  // Wait for user to stop the server
  return new Promise((resolve) => {
    serverProcess.on('close', () => {
      console.info(chalk.yellow('\nWeb server stopped. Returning to menu...\n'));
      resolve();
    });

    // Handle Ctrl+C
    const stopServer = () => {
      serverProcess.kill();
    };

    process.on('SIGINT', stopServer);

    // Clean up listener when done
    serverProcess.on('close', () => {
      process.removeListener('SIGINT', stopServer);
    });
  });
}

export function updateConfigModel(config, model) {
  if (!config.api) config.api = {};
  config.api.model = model;
}

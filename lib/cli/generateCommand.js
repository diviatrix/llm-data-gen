import ora from 'ora';
import { DataGenerator } from '../generator.js';
import { displayConfiguration } from './configDisplay.js';
import { updateConfigModel } from './interactiveMode.js';
import { handleError, AppError } from '../utils/errors.js';
import * as console from '../utils/console.js';

export async function executeGenerate(configManager, options) {
  try {
    let config;

    if (options.config) {
      config = await configManager.loadConfig(options.config);
    } else {
      config = await configManager.loadDefaultConfig();
    }

    if (options.model) {
      updateConfigModel(config, options.model);
    }

    if (options.temperature !== undefined) {
      const temp = parseFloat(options.temperature);
      if (isNaN(temp) || temp < 0 || temp > 2) {
        throw new AppError('Temperature must be a number between 0 and 2');
      }
      config.api.temperature = temp;
    }

    if (options.output) {
      config.output.outputPath = options.output;
    }

    if (options.maxTokens !== undefined) {
      const tokens = parseInt(options.maxTokens);
      if (isNaN(tokens) || tokens < 1) {
        throw new AppError('Max tokens must be a positive integer');
      }
      config.api.maxTokens = tokens;
    }

    if (options.count !== undefined && config.generation?.tasks?.[0]) {
      const count = parseInt(options.count);
      if (isNaN(count) || count < 1) {
        throw new AppError('Count must be a positive integer');
      }
      config.generation.tasks[0].count = count;
    }

    if (options.verbose) {
      config.verbose = true;
    }

    if (options.interactive !== false) {
      await displayConfiguration(config, configManager);

      const inquirer = await import('inquirer');
      const { confirm } = await inquirer.default.prompt([{
        type: 'confirm',
        name: 'confirm',
        message: 'Do you want to proceed with generation?',
        default: true
      }]);

      if (!confirm) {
        console.info('Generation cancelled.');
        return;
      }
    }

    const spinner = ora('Initializing generator...').start();
    const generator = new DataGenerator(config);
    spinner.stop();

    await generator.generateAll();

    console.success(`\nGeneration complete! Generated ${generator.generatedCount} items.`);

    if (generator.totalCost > 0) {
      console.info(`Total cost: ${console.cost(generator.totalCost)}`);
    }

    if (generator.errors.length > 0) {
      console.warning(`\nEncountered ${generator.errors.length} errors during generation.`);
      if (options.verbose) {
        generator.errors.forEach(err => {
          console.error(`- ${err.error}`);
        });
      }
    }

  } catch (error) {
    handleError(error, { verbose: options.verbose });
  }
}

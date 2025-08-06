#!/usr/bin/env node

import { Command } from 'commander';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { ConfigManager } from './lib/configManager.js';
import { testConnection, validateFile, createConfig, listExamples } from './lib/cli/commands.js';
import { runInteractiveMode } from './lib/cli/interactiveMode.js';
import { executeGenerate } from './lib/cli/generateCommand.js';
import { readJsonFile } from './lib/utils/fileIO.js';
import { handleError } from './lib/utils/errors.js';
import { chalk } from './lib/utils/colors.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const packageJson = await readJsonFile(path.join(__dirname, 'package.json'));

const program = new Command();
const configManager = new ConfigManager();

program
  .name(packageJson.name.split('/').pop())
  .description(packageJson.description)
  .version(packageJson.version)
  .configureOutput({
    outputError: (str, write) => write(str)
  });

program
  .command('generate')
  .description('Generate data using configuration')
  .option('-c, --config <path>', 'Path to configuration file')
  .option('-m, --model <model>', 'Override model from config')
  .option('-t, --temperature <value>', 'Override temperature (0-2)')
  .option('-o, --output <path>', 'Override output path')
  .option('--count <number>', 'Override count for first task')
  .option('--max-tokens <number>', 'Override max tokens')
  .option('--no-interactive', 'Skip interactive prompts')
  .option('-v, --verbose', 'Show detailed output during generation')
  .action(async (options) => {
    await executeGenerate(configManager, options);
  });

program
  .command('test')
  .description('Test connection to OpenRouter API')
  .option('-k, --api-key <key>', 'API key to test (optional)')
  .action(testConnection);

program
  .command('validate <file>')
  .description('Validate existing JSON file against schema')
  .requiredOption('-s, --schema <path>', 'Path to JSON schema file')
  .action(validateFile);

program
  .command('create <type>')
  .description('Create example configuration')
  .option('-o, --output <path>', 'Output path for config', './config.json')
  .action((type, options) => createConfig(type, options, configManager));

program
  .command('examples')
  .alias('list')
  .description('List available example configurations')
  .action(() => listExamples(configManager));

program
  .command('interactive')
  .alias('wizard')
  .description('Run interactive configuration wizard')
  .action(async () => {
    await runInteractiveMode(configManager, { version: packageJson.version });
  });

program
  .command('web')
  .alias('ui')
  .description('Start web interface')
  .option('-p, --port <number>', 'Port to run server on', '3000')
  .option('--no-open', 'Don\'t open browser automatically')
  .action(async (options) => {
    console.log(chalk.cyan('🚀 Starting LLM Data Generator Web UI...\n'));

    process.env.PORT = options.port;

    const serverPath = path.join(__dirname, 'server.js');
    const serverProcess = spawn('node', [serverPath], {
      stdio: 'inherit',
      env: { ...process.env, PORT: options.port },
      cwd: __dirname
    });

    if (options.open) {
      setTimeout(() => {
        const url = `http://localhost:${options.port}`;
        console.log(chalk.green(`\n✅ Web UI available at: ${url}`));

        const platform = process.platform;
        const openCommand = platform === 'darwin' ? 'open' : platform === 'win32' ? 'start' : 'xdg-open';
        spawn(openCommand, [url], { shell: true, detached: true });
      }, 2000);
    }

    process.on('SIGINT', () => {
      console.log(chalk.yellow('\n\nShutting down web server...'));
      serverProcess.kill();
      process.exit(0);
    });
  });

process.on('uncaughtException', (error) => {
  if (error.code === 'ERR_USE_AFTER_CLOSE') {
    process.exit(0);
  } else {
    console.error('Unexpected error:', error);
    process.exit(1);
  }
});

async function main() {
  try {
    if (process.argv.length === 2) {
      await runInteractiveMode(configManager, { version: packageJson.version });
      return;
    }

    await program.parseAsync(process.argv);

    const parsedArgs = program.args;
    if (parsedArgs.length === 0 && process.argv.length > 2) {
      console.error(`error: unknown command '${process.argv[2]}'`);
      process.exit(1);
    }
  } catch (error) {
    handleError(error);
  }
}

main();

import inquirer from 'inquirer';
import path from 'path';
import * as console from './utils/console.js';
import fs from 'fs/promises';
import { UserStorage } from './userStorage.js';

export async function setupApiKey(userId = 0) {
  console.warning('\nOpenRouter API key not found or invalid!\n');

  console.info('To use this tool, you need an OpenRouter API key.');
  console.info('Get your API key at: https://openrouter.ai/keys');

  const { choice } = await inquirer.prompt([
    {
      type: 'list',
      name: 'choice',
      message: 'How would you like to proceed?',
      choices: [
        { name: 'Enter API key now', value: 'enter' },
        { name: 'Instructions for manual setup', value: 'manual' },
        { name: 'Exit', value: 'exit' }
      ]
    }
  ]);

  if (choice === 'exit') {
    process.exit(0);
  }

  if (choice === 'manual') {
    console.section('Manual Setup Instructions', '📝');
    console.info('1. Create a .env file in your user data directory');
    console.info(`   Location: ${UserStorage.getUserApiKeyPath(0)}`);
    console.info('2. Add the following line:');
    console.success('   OPENROUTER_API_KEY=your-api-key-here');
    console.info('\nOr set it as an environment variable:');
    console.success('   export OPENROUTER_API_KEY=your-api-key-here');
    process.exit(0);
  }

  const { apiKey } = await inquirer.prompt([
    {
      type: 'password',
      name: 'apiKey',
      message: 'Enter your OpenRouter API key:',
      mask: '*',
      validate: (input) => {
        if (!input || input.trim().length === 0) {
          return 'API key cannot be empty';
        }
        return true;
      }
    }
  ]);

  const isValid = await validateApiKey(apiKey.trim());

  if (!isValid) {
    console.error('\nInvalid API key. Please check and try again.');
    process.exit(1);
  }

  console.success('\nAPI key validated successfully!');

  const { saveChoice } = await inquirer.prompt([
    {
      type: 'list',
      name: 'saveChoice',
      message: 'Where would you like to save the API key?',
      choices: [
        { name: 'Save to .env file (recommended)', value: 'env' },
        { name: 'Use for this session only', value: 'session' },
        { name: 'Show instructions for manual setup', value: 'manual' }
      ]
    }
  ]);

  if (saveChoice === 'env') {
    await saveToEnvFile(apiKey.trim(), userId);
    console.success('\nAPI key saved to user data directory');
    return apiKey.trim();
  }

  if (saveChoice === 'manual') {
    console.section('Add this to your .env file:', '📝');
    console.success(`OPENROUTER_API_KEY=${apiKey.trim()}`);
  }

  return apiKey.trim();
}

async function validateApiKey(apiKey) {
  try {
    const axios = (await import('axios')).default;
    const response = await axios.get('https://openrouter.ai/api/v1/auth/key', {
      headers: {
        'Authorization': `Bearer ${apiKey}`
      }
    });
    return response.status === 200;
  } catch (error) {
    return false;
  }
}

async function saveToEnvFile(apiKey, userId = 0) {
  // Ensure user directories exist
  await UserStorage.ensureUserStructure(userId);
  const envPath = UserStorage.getUserApiKeyPath(userId);
  let envContent = '';

  try {
    envContent = await fs.readFile(envPath, 'utf-8');
  } catch (error) {
    // File doesn't exist, create new
  }

  const lines = envContent.split('\n');
  let keyFound = false;

  const updatedLines = lines.map(line => {
    if (line.startsWith('OPENROUTER_API_KEY=')) {
      keyFound = true;
      return `OPENROUTER_API_KEY=${apiKey}`;
    }
    return line;
  });

  if (!keyFound) {
    if (envContent && !envContent.endsWith('\n')) {
      updatedLines.push('');
    }
    updatedLines.push(`OPENROUTER_API_KEY=${apiKey}`);
  }

  await fs.writeFile(envPath, updatedLines.join('\n'));

  process.env.OPENROUTER_API_KEY = apiKey;
}

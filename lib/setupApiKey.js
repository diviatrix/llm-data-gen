import inquirer from 'inquirer';
import chalk from 'chalk';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export async function setupApiKey() {
  console.log(chalk.yellow('\n⚠️  OpenRouter API key not found or invalid!\n'));
  
  console.log('To use this tool, you need an OpenRouter API key.');
  console.log('Get your API key at: ' + chalk.cyan('https://openrouter.ai/keys'));
  
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
    console.log(chalk.blue('\n📝 Manual Setup Instructions:\n'));
    console.log('1. Create a .env file in the project root');
    console.log('2. Add the following line:');
    console.log(chalk.green('   OPENROUTER_API_KEY=your-api-key-here'));
    console.log('\nOr set it as an environment variable:');
    console.log(chalk.green('   export OPENROUTER_API_KEY=your-api-key-here'));
    process.exit(0);
  }
  
  // Enter API key
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
  
  // Validate the API key
  const isValid = await validateApiKey(apiKey.trim());
  
  if (!isValid) {
    console.log(chalk.red('\n❌ Invalid API key. Please check and try again.'));
    process.exit(1);
  }
  
  console.log(chalk.green('\n✅ API key validated successfully!'));
  
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
    await saveToEnvFile(apiKey.trim());
    console.log(chalk.green('\n✅ API key saved to .env file'));
    return apiKey.trim();
  }
  
  if (saveChoice === 'manual') {
    console.log(chalk.blue('\n📝 Add this to your .env file:'));
    console.log(chalk.green(`OPENROUTER_API_KEY=${apiKey.trim()}`));
  }
  
  // Return the API key for session use
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

async function saveToEnvFile(apiKey) {
  const envPath = path.join(process.cwd(), '.env');
  let envContent = '';
  
  try {
    // Read existing .env file
    envContent = await fs.readFile(envPath, 'utf-8');
  } catch (error) {
    // File doesn't exist, that's okay
  }
  
  // Check if OPENROUTER_API_KEY already exists
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
    // Add the key if not found
    if (envContent && !envContent.endsWith('\n')) {
      updatedLines.push(''); // Add empty line
    }
    updatedLines.push(`OPENROUTER_API_KEY=${apiKey}`);
  }
  
  // Write back to file
  await fs.writeFile(envPath, updatedLines.join('\n'));
  
  // Also update the current process environment
  process.env.OPENROUTER_API_KEY = apiKey;
}
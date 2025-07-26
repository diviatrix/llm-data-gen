import chalk from 'chalk';
import ora from 'ora';
import fs from 'fs/promises';
import { createApiClient } from '../sessionManager.js';
import { DataGenerator } from '../generator.js';

export async function testConnection(options) {
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
}

export async function validateFile(file, options) {
  try {
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
}

export async function createConfig(type, options, configManager) {
  try {
    const config = await configManager.createExampleConfig(type);
    
    await configManager.saveConfig(config, options.output);
    console.log(chalk.green(`✓ Created ${type} config at ${options.output}`));
    
  } catch (error) {
    console.error(chalk.red(`\n❌ Error: ${error.message}`));
    process.exit(1);
  }
}

export async function listExamples(configManager) {
  try {
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
}
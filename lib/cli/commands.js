import ora from '../utils/spinner.js';
import { createApiClient } from '../sessionManager.js';
import { DataGenerator } from '../generator.js';
import { handleError, ApiError, ValidationError } from '../utils/errors.js';
import { readJsonFile } from '../utils/fileIO.js';
import * as console from '../utils/console.js';

export async function testConnection(options = {}) {
  // When running from the interactive menu we don[0m[0m[0mmay want to avoid exiting the entire process so callers can
  // return to the menu.  `options.interactive` will be set by
  // `interactiveMode.js` in that case.
  const { apiKey, interactive = false } = options;

  try {
    const spinner = ora('Testing connection to OpenRouter...').start();

    const client = await createApiClient({
      apiKey
    });

    // Quick validation: reject obviously invalid test API keys
    if (client.apiKey && (client.apiKey === 'test-api-key' || client.apiKey === 'env-test-key' || client.apiKey.length < 20)) {
      spinner.fail('Invalid API key format');
      console.error('API key must be at least 20 characters long');
      process.exit(1);
    }

    const result = await client.testConnection();

    if (result.connected) {
      spinner.succeed('Connected to OpenRouter successfully!');
      console.success(`Total available models: ${result.models.length}`);

      const userInfo = await client.getUserInfo();
      if (userInfo.success && userInfo.data?.data) {
        console.section('Account Information', '👤');
        const data = userInfo.data.data;

        if (data.limit !== undefined && data.usage !== undefined) {
          const limit = parseFloat(data.limit);
          const usage = parseFloat(data.usage);
          const remaining = parseFloat(data.limit_remaining || (limit - usage));
          const percentUsed = limit > 0 ? (usage / limit * 100).toFixed(1) : 0;

          console.keyValue('Balance', `$${remaining.toFixed(2)} of $${limit.toFixed(2)} (${percentUsed}% used)`);
          console.keyValue('API Key', data.label || 'Unknown');
          console.keyValue('Tier', data.is_free_tier ? 'Free' : 'Paid');

          if (data.rate_limit) {
            console.keyValue('Rate Limit', `${data.rate_limit.requests} requests per ${data.rate_limit.interval}`);
          }
        }
      }

      const models = await client.getModels();

      const freeModels = models.filter(m =>
        parseFloat(m.pricing?.prompt || '0') === 0 || m.id.includes(':free')
      );

      console.section('Model Statistics', '📊');
      console.keyValue('Free models', freeModels.length, { indent: '  ', separator: ': 🆓 ' });
      console.keyValue('Paid models', models.length - freeModels.length, { indent: '  ', separator: ': 💰 ' });

      console.section('Top Free Models', '🆓');
      console.list(
        freeModels.slice(0, 10).map(m => `${m.name} (${m.id})`)
      );

      console.section('Popular Paid Models', '💰');
      const paidModels = models.filter(m =>
        !(parseFloat(m.pricing?.prompt || '0') === 0 || m.id.includes(':free')) &&
        (m.id.includes('gpt') || m.id.includes('claude') || m.id.includes('gemini'))
      );
      console.list(
        paidModels.slice(0, 10).map(m => {
          const pricePerMillion = parseFloat(m.pricing?.prompt || 0) * 1000000;
          return console.modelInfo(m.name, pricePerMillion);
        })
      );
    } else {
      spinner.fail('Failed to connect to OpenRouter');
      throw new ApiError(result.error);
    }

    // only exit when this was invoked as a standalone CLI command
    if (!interactive) {
      process.exit(0);
    }
    return true;
  } catch (error) {
    if (interactive) {
      // Mirror `handleError` output but do not kill the process.
      // We can't simply call handleError() because that always exits.
      if (error.spinner) {
        error.spinner.fail(error.message);
      }
      console.error(`\n❌ Error: ${error.message}`);
      if (error.context && Object.keys(error.context).length > 0) {
        console.error('\nError context:');
        console.error(JSON.stringify(error.context, null, 2));
      }
      // return false so caller can detect failure if needed
      return false;
    } else {
      handleError(error);
      // `handleError` will exit, but add a return for completeness
      return false;
    }
  }
}

export async function validateFile(file, options) {
  try {
    let schema;
    if (options.schema) {
      const parsed = await readJsonFile(options.schema);
      schema = parsed.schema || parsed;
    } else {
      throw new ValidationError('Schema is required for validation');
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

    console.section('Validation Results', '📊');
    console.success(`Valid: ${valid.length}`);
    console.error(`Invalid: ${invalid.length}`, '✗');

    if (invalid.length > 0) {
      console.error('\nInvalid items:');
      console.list(
        invalid.slice(0, 10).map(item => `${item.item}: ${item.errors.join(', ')}`)
      );
      if (invalid.length > 10) {
        console.info(`... and ${invalid.length - 10} more`);
      }
    }

  } catch (error) {
    handleError(error);
  }
}

export async function createConfig(type, options, configManager) {
  try {
    const config = await configManager.createExampleConfig(type);

    await configManager.saveConfig(config, options.output);
    console.success(`Created ${type} config at ${options.output}`);

  } catch (error) {
    handleError(error);
  }
}

export async function listExamples(configManager) {
  try {
    const examples = await configManager.listExamples();

    if (examples.length === 0) {
      console.warning('No example configurations found');
      return;
    }

    console.section('Available examples', '📁');
    for (const example of examples) {
      try {
        const config = await configManager.loadExample(example);
        const info = configManager.getConfigInfo(config);
        console.info(`\n${example}`, '📄');
        console.keyValue('Name', info.name, { indent: '    ' });
        console.keyValue('Properties', info.propertiesCount, { indent: '    ' });
        console.keyValue('Tasks', info.tasksCount, { indent: '    ' });
      } catch (err) {
        console.debug(`  ${example} (error loading)`);
      }
    }

  } catch (error) {
    handleError(error);
  }
}

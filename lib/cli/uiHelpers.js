import { chalk } from '../utils/colors.js';

export function formatModelPrice(model) {
  const promptPrice = parseFloat(model.pricing?.prompt || '0');
  const isFree = promptPrice === 0 || model.id.includes(':free');
  const pricePerMillion = promptPrice * 1000000;

  let priceStr;
  if (isFree) {
    priceStr = 'Free';
  } else if (pricePerMillion < 1) {
    priceStr = `$${pricePerMillion.toFixed(3)}/M`;
  } else if (pricePerMillion < 10) {
    priceStr = `$${pricePerMillion.toFixed(2)}/M`;
  } else {
    priceStr = `$${pricePerMillion.toFixed(1)}/M`;
  }

  const priceEmoji = isFree ? '🆓' : '💰';
  return `${priceEmoji} ${priceStr.padEnd(8)}`;
}

export function formatModelContext(model) {
  const contextWindow = model.context_length ?
    `${(model.context_length / 1000).toFixed(0)}K` : '?';
  return `[${contextWindow.padStart(5)}]`;
}

export function formatModelCapabilities(model) {
  const caps = [];
  if (model.supported_parameters?.includes('tools')) caps.push('🔧');
  if (model.architecture?.input_modalities?.includes('image')) caps.push('👁️');
  if (model.supported_parameters?.includes('stream')) caps.push('⚡');
  return caps.join('').padEnd(3);
}

export function formatModelDate(model) {
  if (!model.created) return '';
  return new Date(model.created * 1000).toLocaleDateString('en-US', {
    month: '2-digit',
    day: '2-digit',
    year: 'numeric'
  });
}

export function formatModelChoice(model, isCurrent = false) {
  const price = formatModelPrice(model);
  const context = formatModelContext(model);
  const caps = formatModelCapabilities(model);
  const date = formatModelDate(model);

  // Use model.id instead of model.name for easy copying
  const idPart = model.id.substring(0, 50).padEnd(50);
  const pricePart = price.padEnd(12);

  const displayText = `${pricePart}${idPart} ${context} ${caps} ${date}`;

  if (isCurrent) {
    return {
      name: `✅ ${displayText} (current)`,
      value: model.id
    };
  }

  return {
    name: displayText,
    value: model.id
  };
}

export function createSeparatorChoice() {
  return { name: '────────────────────────────────────────', disabled: true };
}

export function createBackChoice(text = 'Back') {
  return { name: `⬅️ ${text}`, value: 'back' };
}

export function displayAccountInfo(userInfo) {
  if (!userInfo.success || !userInfo.data?.data) return;

  console.log(chalk.bold('\n👤 Account Info:'));
  const data = userInfo.data.data;

  if (data.limit !== undefined && data.usage !== undefined) {
    const limit = parseFloat(data.limit);
    const usage = parseFloat(data.usage);
    const remaining = parseFloat(data.limit_remaining || (limit - usage));
    const percentUsed = limit > 0 ? (usage / limit * 100).toFixed(1) : 0;

    console.log(`  ${chalk.gray('balance')}: ${chalk.green(`$${remaining.toFixed(2)}`)} of $${limit.toFixed(2)} (${percentUsed}% used)`);
    console.log(`  ${chalk.gray('usage')}: ${chalk.yellow(`$${usage.toFixed(2)}`)}`);

    if (data.is_free_tier !== undefined) {
      console.log(`  ${chalk.gray('tier')}: ${data.is_free_tier ? chalk.cyan('Free') : chalk.yellow('Paid')}`);
    }

    if (data.rate_limit) {
      console.log(`  ${chalk.gray('rate limit')}: ${chalk.cyan(`${data.rate_limit.requests} requests per ${data.rate_limit.interval}`)}`);
    }
  }
}

export function calculateEstimatedCost(pricePerMillion, tasks, maxTokens) {
  const totalRequests = tasks.reduce((sum, task) => sum + (task.count || 0), 0);
  const estimatedTokens = totalRequests * maxTokens;
  const estimatedMillions = estimatedTokens / 1000000;
  return pricePerMillion * estimatedMillions;
}

export async function getModelPrice(modelId, createApiClient) {
  try {
    const client = await createApiClient();
    const models = await client.getModels();
    const model = models.find(m => m.id === modelId);
    if (model?.pricing?.prompt) {
      return parseFloat(model.pricing.prompt) * 1000000;
    }
  } catch (error) {
    // Return default price on error
  }
  return 0;
}

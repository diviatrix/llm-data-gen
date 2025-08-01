import { createApiClient } from '../sessionManager.js';
import { displayAccountInfo, getModelPrice, calculateEstimatedCost } from './uiHelpers.js';
import * as console from '../utils/console.js';

export async function displayConfiguration(config, configManager) {
  const client = await createApiClient(config.api);
  const userInfo = await client.getUserInfo();

  displayAccountInfo(userInfo);

  console.section('Configuration', '📋');
  const info = configManager.getConfigInfo(config);

  console.keyValue('name', info.name);
  console.keyValue('version', info.version);
  console.keyValue('model', info.model);
  console.keyValue('temperature', info.temperature);
  console.keyValue('max tokens', info.maxTokens);
  console.keyValue('output path', info.outputPath);

  const modelId = config.api?.model || 'openrouter/auto';

  if (modelId === 'openrouter/auto') {
    console.keyValue('estimated max cost', 'Variable (Auto Router)');
  } else {
    const pricePerMillion = await getModelPrice(modelId, createApiClient);
    const estimatedCost = calculateEstimatedCost(pricePerMillion, info.tasks, info.maxTokens);

    if (pricePerMillion > 0) {
      console.keyValue('estimated max cost', console.cost(estimatedCost));
    } else {
      console.keyValue('estimated max cost', 'Free');
    }
  }

  if (info.tasks.length > 0) {
    const totalItems = info.tasks.reduce((sum, task) => sum + (task.count || 0), 0);
    console.info(`\nTasks (${info.tasksCount}), Total items: ${totalItems}`);

    info.tasks.forEach((task, i) => {
      const taskInfo = Object.entries(task)
        .filter(([k]) => k !== 'count')
        .map(([k, v]) => `${k}=${v}`)
        .join(', ');
      console.info(`  ${i + 1}. ${task.count} items: ${taskInfo}`);
    });
  }
}

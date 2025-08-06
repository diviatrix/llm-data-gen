import { OpenRouterClient } from '../apiClient.js';
import { setupApiKey } from '../setupApiKey.js';
import { warning } from './console.js';

let sessionApiKey = null;
let clientInstance = null;
let lastConfig = null;

function configsEqual(config1, config2) {
  const c1 = config1 || {};
  const c2 = config2 || {};

  return c1.apiKey === c2.apiKey &&
         c1.model === c2.model &&
         c1.temperature === c2.temperature &&
         c1.maxTokens === c2.maxTokens;
}

export async function ensureApiKey() {
  if (sessionApiKey) {
    process.env.OPENROUTER_API_KEY = sessionApiKey;
    return sessionApiKey;
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (apiKey) {
    try {
      const client = new OpenRouterClient();
      await client.testConnection();
      return apiKey;
    } catch (error) {
      warning('Existing API key appears to be invalid.');
    }
  }

  sessionApiKey = await setupApiKey();
  return sessionApiKey;
}

export async function createApiClient(config = {}, req = null) {
  if (req && req.user && req.userApiKey) {
    config.apiKey = req.userApiKey;
  }

  if (clientInstance && configsEqual(config, lastConfig)) {
    return clientInstance;
  }

  if (!config.apiKey) {
    if (req) {
      clientInstance = new OpenRouterClient(config);
      lastConfig = { ...config };
      return clientInstance;
    } else {
      await ensureApiKey();
    }
  }

  clientInstance = new OpenRouterClient(config);
  lastConfig = { ...config };

  return clientInstance;
}

export function resetApiClient() {
  clientInstance = null;
  lastConfig = null;
  sessionApiKey = null;
}

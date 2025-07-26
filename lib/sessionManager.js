import chalk from 'chalk';
import { OpenRouterClient } from './apiClient.js';
import { setupApiKey } from './setupApiKey.js';

// Global variable to store session API key
let sessionApiKey = null;

export async function ensureApiKey() {
  // If we already have a session key, use it
  if (sessionApiKey) {
    process.env.OPENROUTER_API_KEY = sessionApiKey;
    return sessionApiKey;
  }
  
  // Check if API key exists
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (apiKey) {
    // Validate the existing key
    try {
      const client = new OpenRouterClient();
      await client.testConnection();
      return apiKey;
    } catch (error) {
      console.log(chalk.yellow('\n⚠️  Existing API key appears to be invalid.'));
    }
  }
  
  // No valid key found, run setup
  sessionApiKey = await setupApiKey();
  return sessionApiKey;
}

export async function createApiClient(config = {}) {
  // If API key is provided in config, use it directly
  if (config.apiKey) {
    return new OpenRouterClient(config);
  }
  
  await ensureApiKey();
  return new OpenRouterClient(config);
}
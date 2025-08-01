import axios from 'axios';
import { config as dotenvConfig } from 'dotenv';
import { ApiError } from './utils/errors.js';

dotenvConfig();

export class OpenRouterClient {
  constructor(config = {}) {
    this.apiKey = config.apiKey || process.env.OPENROUTER_API_KEY;
    this.baseURL = 'https://openrouter.ai/api/v1';
    this.model = config.model || 'openrouter/auto';
    this.temperature = config.temperature ?? 0.6;
    this.maxTokens = config.maxTokens || 4000;
    this.retryAttempts = config.retryAttempts || 3;
    this.retryDelay = config.retryDelay || 1000;

    this._initClient();
  }

  _initClient() {
    if (!this.apiKey) {
      return;
    }

    this.client = axios.create({
      baseURL: this.baseURL,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://github.com/llm-data-gen',
        'X-Title': 'LLM Data Generator'
      }
    });
  }

  _ensureApiKey() {
    if (!this.apiKey) {
      throw new ApiError('OpenRouter API key is required. Set OPENROUTER_API_KEY environment variable or pass apiKey in config.');
    }
    if (!this.client) {
      this._initClient();
    }
  }

  setApiKey(apiKey) {
    this.apiKey = apiKey;
    this._initClient();
  }

  async generateCompletion(messages, options = {}) {
    this._ensureApiKey();

    const requestData = {
      model: options.model || this.model,
      messages: messages,
      temperature: options.temperature ?? this.temperature,
      max_tokens: options.maxTokens || this.maxTokens
    };

    if (options.format !== 'text') {
      requestData.response_format = { type: 'json_object' };
    }

    for (let attempt = 0; attempt < this.retryAttempts; attempt++) {
      try {
        const response = await this.client.post('/chat/completions', requestData);

        if (response.data?.choices?.[0]?.message?.content) {
          const content = response.data.choices[0].message.content;

          if (options.format === 'text') {
            if (options.verbose) {
              return {
                data: content,
                usage: response.data.usage,
                model: response.data.model,
                id: response.data.id
              };
            }
            return content;
          }

          const parsedContent = this._parseResponse(content);

          if (options.verbose) {
            return {
              data: parsedContent,
              usage: response.data.usage,
              model: response.data.model,
              id: response.data.id
            };
          }

          return parsedContent;
        }

        throw new Error('Invalid response structure from OpenRouter');
      } catch (error) {
        if (attempt === this.retryAttempts - 1) {
          throw this._enhanceError(error);
        }

        await this._delay(this.retryDelay * Math.pow(2, attempt));
      }
    }
  }

  async generateJSON(systemPrompt, userPrompt, options = {}) {
    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ];

    return this.generateCompletion(messages, options);
  }

  async generateBatch(systemPrompt, prompts, options = {}) {
    const results = [];
    const errors = [];

    for (let i = 0; i < prompts.length; i++) {
      try {
        const result = await this.generateJSON(systemPrompt, prompts[i], options);
        results.push({ index: i, success: true, data: result });
      } catch (error) {
        errors.push({ index: i, error: error.message });
        results.push({ index: i, success: false, error: error.message });
      }

      if (options.onProgress) {
        options.onProgress(i + 1, prompts.length, results[i]);
      }

      if (i < prompts.length - 1) {
        await this._delay(options.batchDelay || 1000);
      }
    }

    return { results, errors };
  }

  async testConnection() {
    this._ensureApiKey();
    try {
      const response = await this.client.get('/models');
      return {
        connected: true,
        models: response.data?.data?.map(m => m.id) || []
      };
    } catch (error) {
      return {
        connected: false,
        error: error.message
      };
    }
  }

  async getModels() {
    this._ensureApiKey();
    try {
      const response = await this.client.get('/models');
      const models = response.data?.data || [];

      return models.sort((a, b) => {
        if (a.created && b.created) {
          return new Date(b.created) - new Date(a.created);
        }
        if (a.created && !b.created) return -1;
        if (!a.created && b.created) return 1;
        return a.name.localeCompare(b.name);
      });
    } catch (error) {
      console.error('Failed to fetch models:', error.message);
      return [];
    }
  }

  async getUserInfo() {
    this._ensureApiKey();
    try {
      const endpoints = [
        '/auth/key',
        '/user/credits',
        '/user/info',
        '/me'
      ];

      for (const endpoint of endpoints) {
        try {
          const response = await this.client.get(endpoint);
          if (response.data) {
            return {
              success: true,
              endpoint,
              data: response.data
            };
          }
        } catch (err) {
          continue;
        }
      }

      return {
        success: false,
        message: 'User info not available'
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  _parseResponse(content) {
    try {
      const cleaned = content.trim();

      const jsonMatch = cleaned.match(/```json\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[1]);
      }

      const jsonStart = cleaned.indexOf('{');
      const jsonEnd = cleaned.lastIndexOf('}');
      if (jsonStart !== -1 && jsonEnd !== -1) {
        return JSON.parse(cleaned.substring(jsonStart, jsonEnd + 1));
      }

      return JSON.parse(cleaned);
    } catch (error) {
      throw new Error(`Failed to parse JSON response: ${error.message}\nContent: ${content.substring(0, 200)}...`);
    }
  }

  _enhanceError(error) {
    if (error.response) {
      const status = error.response.status;
      const data = error.response.data;

      switch (status) {
      case 401:
        return new Error('Invalid API key. Check your OPENROUTER_API_KEY.');
      case 429:
        return new Error('Rate limit exceeded. Please wait and try again.');
      case 500:
      case 502:
      case 503:
        return new Error('OpenRouter service temporarily unavailable.');
      default:
        return new Error(`OpenRouter API error (${status}): ${data?.error?.message || error.message}`);
      }
    }

    if (error.code === 'ECONNREFUSED') {
      return new Error('Cannot connect to OpenRouter. Check your internet connection.');
    }

    return error;
  }

  _delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  updateConfig(config) {
    if (config.model !== undefined) this.model = config.model;
    if (config.temperature !== undefined) this.temperature = config.temperature;
    if (config.maxTokens !== undefined) this.maxTokens = config.maxTokens;
  }

  getConfig() {
    return {
      model: this.model,
      temperature: this.temperature,
      maxTokens: this.maxTokens,
      baseURL: this.baseURL
    };
  }
}

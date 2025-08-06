import { ApiError } from './utils/errors.js';
import * as console from './utils/console.js';
import { DiagnosticsTracker } from './diagnostics.js';

export class OpenRouterClient {
  constructor(config = {}) {
    this.apiKey = config.apiKey || process.env.OPENROUTER_API_KEY;
    this.baseURL = 'https://openrouter.ai/api/v1';
    this.model = config.model || 'openrouter/auto';
    this.temperature = config.temperature ?? 0.6;
    this.maxTokens = config.maxTokens || 4000;
    this.retryAttempts = config.retryAttempts || 3;
    this.retryDelay = config.retryDelay || 1000;
    this.timeout = config.timeout || 30000;
  }

  _getHeaders() {
    return {
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://github.com/llm-data-gen',
      'X-Title': 'LLM Data Generator'
    };
  }

  _ensureApiKey() {
    if (!this.apiKey) {
      throw new ApiError('OpenRouter API key is required. Set OPENROUTER_API_KEY environment variable or pass apiKey in config.');
    }
  }

  setApiKey(apiKey) {
    this.apiKey = apiKey;
  }

  async _fetchWithRetry(url, options = {}, attempt = 0) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);
    const startTime = performance.now();
    const endpoint = url.replace(this.baseURL, '');

    try {
      DiagnosticsTracker.trackApiRequest(this.model, endpoint, options);

      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: this._getHeaders()
      });

      clearTimeout(timeoutId);
      const duration = performance.now() - startTime;

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: { message: response.statusText } }));
        const error = this._createHttpError(response.status, errorData);
        DiagnosticsTracker.trackApiError(this.model, endpoint, error, duration);
        throw error;
      }

      DiagnosticsTracker.trackApiResponse(this.model, endpoint, response.status, duration);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      const duration = performance.now() - startTime;

      if (error.name === 'AbortError') {
        const timeoutError = new ApiError('Request timeout', { timeout: this.timeout });
        DiagnosticsTracker.trackApiError(this.model, endpoint, timeoutError, duration);
        throw timeoutError;
      }

      if (attempt < this.retryAttempts - 1) {
        const delay = this.retryDelay * Math.pow(2, attempt);
        await this._delay(delay);
        return this._fetchWithRetry(url, options, attempt + 1);
      }

      const enhancedError = this._enhanceError(error);
      DiagnosticsTracker.trackApiError(this.model, endpoint, enhancedError, duration);
      throw enhancedError;
    }
  }

  async generateCompletion(messages, options = {}) {
    this._ensureApiKey();

    const modelToUse = options.model || this.model;
    if (modelToUse.includes(':online')) {
      console.info(`\n[OpenRouterClient] Using model with web search: ${modelToUse}`);
    }

    const requestData = {
      model: modelToUse,
      messages: messages,
      temperature: options.temperature ?? this.temperature,
      max_tokens: options.maxTokens || this.maxTokens
    };

    if (options.format !== 'text') {
      requestData.response_format = { type: 'json_object' };
    }

    const response = await this._fetchWithRetry(
      `${this.baseURL}/chat/completions`,
      {
        method: 'POST',
        body: JSON.stringify(requestData)
      }
    );

    const responseData = await response.json();

    if (responseData?.choices?.[0]?.message?.content) {
      const content = responseData.choices[0].message.content;

      if (options.format === 'text') {
        if (options.verbose) {
          return {
            data: content,
            usage: responseData.usage,
            model: responseData.model,
            id: responseData.id
          };
        }
        return content;
      }

      const parsedContent = this._parseResponse(content);

      if (options.verbose) {
        return {
          data: parsedContent,
          usage: responseData.usage,
          model: responseData.model,
          id: responseData.id
        };
      }

      return parsedContent;
    }

    throw new ApiError('Invalid response structure from OpenRouter', { response: responseData });
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
      const response = await this._fetchWithRetry(`${this.baseURL}/models`, { method: 'GET' });
      const data = await response.json();
      return {
        connected: true,
        models: data?.data?.map(m => m.id) || []
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
      const response = await this._fetchWithRetry(`${this.baseURL}/models`, { method: 'GET' });
      const data = await response.json();
      const models = data?.data || [];

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
          const response = await this._fetchWithRetry(`${this.baseURL}${endpoint}`, { method: 'GET' });
          const data = await response.json();
          if (data) {
            return {
              success: true,
              endpoint,
              data
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
      throw new ApiError(`Failed to parse JSON response: ${error.message}`, {
        content: content.substring(0, 200)
      });
    }
  }

  _createHttpError(status, data) {
    switch (status) {
    case 401:
      return new ApiError('Invalid API key. Check your OPENROUTER_API_KEY.', { status });
    case 429:
      return new ApiError('Rate limit exceeded. Please wait and try again.', { status });
    case 500:
    case 502:
    case 503:
      return new ApiError('OpenRouter service temporarily unavailable.', { status });
    default:
      return new ApiError(
        `OpenRouter API error (${status}): ${data?.error?.message || 'Unknown error'}`,
        { status, data }
      );
    }
  }

  _enhanceError(error) {
    if (error instanceof ApiError) {
      return error;
    }

    if (error.cause?.code === 'ECONNREFUSED') {
      return new ApiError('Cannot connect to OpenRouter. Check your internet connection.', {
        code: 'ECONNREFUSED'
      });
    }

    return new ApiError(error.message, { originalError: error });
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

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class ConfigManager {
  constructor() {
    this.defaultConfigPath = path.join(__dirname, '..', 'configs', 'default.json');
    this.examplesPath = path.join(__dirname, '..', 'configs', 'examples');
  }

  async loadConfig(configPath) {
    try {
      const absolutePath = path.isAbsolute(configPath) 
        ? configPath 
        : path.join(process.cwd(), configPath);
      
      const content = await fs.readFile(absolutePath, 'utf-8');
      const config = JSON.parse(content);
      
      return this._validateConfig(config);
    } catch (error) {
      if (error.code === 'ENOENT') {
        throw new Error(`Config file not found: ${configPath}`);
      }
      if (error instanceof SyntaxError) {
        throw new Error(`Invalid JSON in config file: ${error.message}`);
      }
      throw error;
    }
  }

  async loadDefaultConfig() {
    try {
      return await this.loadConfig(this.defaultConfigPath);
    } catch (error) {
      return this._getMinimalConfig();
    }
  }

  async listExamples() {
    try {
      const files = await fs.readdir(this.examplesPath);
      return files.filter(f => f.endsWith('.json'));
    } catch (error) {
      return [];
    }
  }

  async loadExample(name) {
    const examplePath = path.join(this.examplesPath, name.endsWith('.json') ? name : `${name}.json`);
    return this.loadConfig(examplePath);
  }

  mergeConfigs(base, override) {
    const merged = JSON.parse(JSON.stringify(base));
    
    const deepMerge = (target, source) => {
      for (const key in source) {
        if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
          if (!target[key]) target[key] = {};
          deepMerge(target[key], source[key]);
        } else {
          target[key] = source[key];
        }
      }
    };
    
    deepMerge(merged, override);
    return merged;
  }

  applyCliOptions(config, options) {
    const updated = JSON.parse(JSON.stringify(config));
    
    if (options.model) {
      if (!updated.api) updated.api = {};
      updated.api.model = options.model;
    }
    
    if (options.temperature !== undefined) {
      if (!updated.api) updated.api = {};
      updated.api.temperature = parseFloat(options.temperature);
    }
    
    if (options.maxTokens) {
      if (!updated.api) updated.api = {};
      updated.api.maxTokens = parseInt(options.maxTokens);
    }
    
    if (options.output) {
      if (!updated.output) updated.output = {};
      updated.output.outputPath = options.output;
    }
    
    if (options.count) {
      if (updated.generation?.tasks?.[0]) {
        updated.generation.tasks[0].count = parseInt(options.count);
      }
    }
    
    return updated;
  }

  _validateConfig(config) {
    const format = config.output?.format || 'json';
    
    // Schema is only required for JSON format
    if (format === 'json') {
      const required = ['schema'];
      const missing = required.filter(key => !config[key]);
      
      if (missing.length > 0) {
        throw new Error(`Missing required config fields: ${missing.join(', ')}`);
      }
      
      if (!config.schema.type) {
        throw new Error('Schema must have a type property');
      }
    }
    
    if (config.api) {
      if (config.api.temperature !== undefined) {
        const temp = config.api.temperature;
        if (typeof temp !== 'number' || temp < 0 || temp > 2) {
          throw new Error('Temperature must be a number between 0 and 2');
        }
      }
      
      if (config.api.maxTokens !== undefined) {
        const tokens = config.api.maxTokens;
        if (typeof tokens !== 'number' || tokens < 1) {
          throw new Error('maxTokens must be a positive number');
        }
      }
    }
    
    return config;
  }

  _getMinimalConfig() {
    return {
      meta: {
        name: 'Default Data Generator',
        version: '1.0'
      },
      api: {
        provider: 'openrouter',
        model: 'openrouter/auto',
        temperature: 0.6,
        maxTokens: 4000
      },
      output: {
        type: 'array',
        outputPath: './output/'
      },
      schema: {
        type: 'object',
        properties: {}
      },
      prompts: {
        system: 'Generate valid JSON data according to the schema.'
      }
    };
  }

  async saveConfig(config, outputPath) {
    const content = JSON.stringify(config, null, 2);
    await fs.writeFile(outputPath, content, 'utf-8');
  }

  async createExampleConfig(type = 'basic') {
    const examples = {
      basic: {
        meta: {
          name: 'Basic Example',
          version: '1.0'
        },
        api: {
          provider: 'openrouter',
          model: 'openrouter/auto',
          temperature: 0.7
        },
        output: {
          type: 'array',
          outputPath: './output/',
          fileNameTemplate: '{type}.json'
        },
        schema: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              'x-llm-generate': {
                template: '{type}_{index}'
              }
            },
            name: {
              type: 'string',
              'x-llm-generate': {
                prompt: 'Generate a creative name'
              }
            },
            description: {
              type: 'string',
              'x-llm-generate': {
                prompt: 'Write a brief description (2-3 sentences)',
                maxLength: 200
              }
            }
          },
          required: ['id', 'name', 'description']
        },
        generation: {
          tasks: [
            { type: 'example', count: 10 }
          ]
        }
      }
    };
    
    return examples[type] || examples.basic;
  }

  getConfigInfo(config) {
    return {
      name: config.meta?.name || 'Unnamed',
      version: config.meta?.version || '1.0',
      model: config.api?.model || 'default',
      schemaType: config.schema?.type || 'unknown',
      propertiesCount: Object.keys(config.schema?.properties || {}).length,
      tasksCount: config.generation?.tasks?.length || 0,
      outputPath: config.output?.outputPath || 'none',
      tasks: config.generation?.tasks || [],
      maxTokens: config.api?.maxTokens || 4000,
      temperature: config.api?.temperature || 0.7
    };
  }
}
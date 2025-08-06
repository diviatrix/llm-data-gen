import path from 'path';
import { fileURLToPath } from 'url';
import { UserStorage } from './userStorage.js';
import { readJsonFile, writeJsonFile, readDir } from './utils/fileIO.js';
import { ConfigError, ValidationError } from './utils/errors.js';
import { validateRequired } from './utils/validation.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class ConfigManager {
  constructor() {
    this.defaultConfigPath = path.join(__dirname, '..', 'configs', 'examples', 'default.json');
    this.examplesPath = path.join(__dirname, '..', 'configs', 'examples');
  }

  async loadConfig(configPath) {
    try {
      const absolutePath = path.isAbsolute(configPath)
        ? configPath
        : path.join(process.cwd(), configPath);

      const config = await readJsonFile(absolutePath);
      return this._validateConfig(config);
    } catch (error) {
      if (error.code === 'FILE_NOT_FOUND') {
        throw new ConfigError(`Config file not found: ${configPath}`);
      }
      throw error;
    }
  }

  async loadDefaultConfig() {
    try {
      const userDefaultPath = path.join(UserStorage.getUserConfigsDir(0), 'default.json');
      return await this.loadConfig(userDefaultPath);
    } catch (error) {
      try {
        return await this.loadConfig(this.defaultConfigPath);
      } catch {
        return this._getMinimalConfig();
      }
    }
  }

  async listExamples() {
    try {
      const userExamplesPath = path.join(UserStorage.getUserConfigsDir(0), 'examples');
      const userFiles = await readDir(userExamplesPath);
      const userExamples = userFiles.filter(f => f.endsWith('.json'));

      if (userExamples.length > 0) {
        return userExamples;
      }

      const files = await readDir(this.examplesPath);
      return files.filter(f => f.endsWith('.json'));
    } catch (error) {
      return [];
    }
  }

  async loadExample(name) {
    const filename = name.endsWith('.json') ? name : `${name}.json`;
    try {
      const configPath = path.join(UserStorage.getUserConfigsDir(0), 'examples', filename);
      return this.loadConfig(configPath);
    } catch {
      const examplePath = path.join(this.examplesPath, filename);
      return this.loadConfig(examplePath);
    }
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

    if (format === 'json') {
      validateRequired(config, ['schema'], 'Config');

      if (!config.schema.type) {
        throw new ValidationError('Schema must have a type property');
      }
    }

    if (config.api) {
      if (config.api.temperature !== undefined) {
        const temp = config.api.temperature;
        if (typeof temp !== 'number' || temp < 0 || temp > 2) {
          throw new ValidationError('Temperature must be a number between 0 and 2');
        }
      }

      if (config.api.maxTokens !== undefined) {
        const tokens = config.api.maxTokens;
        if (typeof tokens !== 'number' || tokens < 1) {
          throw new ValidationError('maxTokens must be a positive number');
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
        outputPath: UserStorage.getUserOutputDir(0)
      },
      schema: {
        type: 'object',
        properties: {}
      },
      prompts: {
        system: 'Generate valid JSON data according to the schema.'
      },
      generation: {
        tasks: [{
          name: 'Sample',
          count: 10
        }]
      }
    };
  }

  async saveConfig(config, outputPath) {
    await writeJsonFile(outputPath, config);
  }

  async createExampleConfig(type = 'basic') {
    const examples = {
      basic: {
        meta: {
          name: 'Basic Example',
          version: '1.0',
          description: 'Simple JSON data generation example'
        },
        api: {
          provider: 'openrouter',
          model: 'openrouter/auto',
          temperature: 0.7,
          maxTokens: 2000
        },
        output: {
          type: 'array',
          outputPath: './output/',
          fileNameTemplate: '{theme}_{index}.json'
        },
        schema: {
          type: 'object',
          properties: {
            items: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: {
                    type: 'string',
                    'x-llm-generate': {
                      template: '{theme}_{index}'
                    }
                  },
                  title: {
                    type: 'string',
                    'x-llm-generate': {
                      prompt: 'Generate a creative title related to {theme}',
                      maxLength: 100
                    }
                  },
                  description: {
                    type: 'string',
                    'x-llm-generate': {
                      prompt: 'Write a brief description (2-3 sentences) about {theme}',
                      maxLength: 200
                    }
                  }
                },
                required: ['id', 'title', 'description']
              }
            }
          }
        },
        prompts: {
          system: 'You are a helpful data generator. Generate creative and relevant data according to the schema requirements. Return only valid JSON.'
        },
        generation: {
          tasks: [
            { theme: 'Technology', count: 5 },
            { theme: 'Science', count: 5 }
          ]
        }
      },
      advanced: {
        meta: {
          name: 'Advanced Example',
          version: '1.0',
          description: 'Complex schema with multiple tasks and custom prompts'
        },
        api: {
          provider: 'openrouter',
          model: 'openrouter/auto',
          temperature: 0.8,
          maxTokens: 6000
        },
        output: {
          type: 'array',
          outputPath: './output/',
          fileNameTemplate: '{type}_{theme}_{index}.json'
        },
        schema: {
          type: 'object',
          properties: {
            id: {
              type: 'string',
              'x-llm-generate': {
                template: '{type}_{theme}_{index}'
              }
            },
            title: {
              type: 'string',
              'x-llm-generate': {
                prompt: 'Generate a compelling title related to {theme}'
              }
            },
            content: {
              type: 'string',
              'x-llm-generate': {
                prompt: 'Write detailed content about {theme} (3-5 paragraphs)',
                maxLength: 1000
              }
            },
            tags: {
              type: 'array',
              items: { type: 'string' },
              'x-llm-generate': {
                prompt: 'Generate 3-5 relevant tags for {theme}',
                count: 5
              }
            },
            metadata: {
              type: 'object',
              properties: {
                category: { type: 'string' },
                difficulty: { type: 'string', enum: ['beginner', 'intermediate', 'advanced'] },
                estimatedTime: { type: 'number' }
              },
              'x-llm-generate': {
                prompt: 'Generate appropriate metadata for {theme} content'
              }
            },
            createdAt: {
              type: 'string',
              format: 'date-time',
              'x-llm-generate': {
                template: '{now}'
              }
            }
          },
          required: ['id', 'title', 'content', 'tags', 'metadata', 'createdAt']
        },
        generation: {
          tasks: [
            { type: 'article', theme: 'technology', count: 5 },
            { type: 'tutorial', theme: 'programming', count: 3 },
            { type: 'review', theme: 'software', count: 2 }
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

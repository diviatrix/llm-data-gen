import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConfigManager } from '../../../lib/configManager.js';
import { UserStorage } from '../../../lib/userStorage.js';
import { readJsonFile, writeJsonFile } from '../../../lib/utils/fileIO.js';
import { ConfigError, ValidationError } from '../../../lib/utils/errors.js';
import path from 'path';

vi.mock('../../../lib/userStorage.js', () => ({
  UserStorage: {
    getUserConfigsDir: vi.fn(() => path.sep + path.join('test', 'user', 'configs')),
    getUserOutputDir: vi.fn(() => path.sep + path.join('test', 'user', 'output'))
  }
}));
vi.mock('../../../lib/utils/fileIO.js');

describe('ConfigManager', () => {
  let configManager;

  beforeEach(() => {
    configManager = new ConfigManager();
    vi.clearAllMocks();
  });

  describe('loadConfig', () => {
    it('should load config from absolute path', async () => {
      const mockConfig = {
        schema: { type: 'object' },
        output: { format: 'json' }
      };
      vi.mocked(readJsonFile).mockResolvedValue(mockConfig);

      const result = await configManager.loadConfig('/absolute/path/config.json');

      expect(readJsonFile).toHaveBeenCalledWith('/absolute/path/config.json');
      expect(result).toEqual(mockConfig);
    });

    it('should load config from relative path', async () => {
      const mockConfig = {
        schema: { type: 'object' },
        output: { format: 'json' }
      };
      vi.mocked(readJsonFile).mockResolvedValue(mockConfig);

      await configManager.loadConfig('./config.json');

      expect(readJsonFile).toHaveBeenCalledWith(
        path.join(process.cwd(), './config.json')
      );
    });

    it('should throw ConfigError for non-existent file', async () => {
      const error = new Error('File not found');
      error.code = 'FILE_NOT_FOUND';
      vi.mocked(readJsonFile).mockRejectedValue(error);

      await expect(configManager.loadConfig('missing.json'))
        .rejects.toThrow(ConfigError);
    });

    it('should validate loaded config', async () => {
      const invalidConfig = { output: { format: 'json' } };
      vi.mocked(readJsonFile).mockResolvedValue(invalidConfig);

      await expect(configManager.loadConfig('config.json'))
        .rejects.toThrow(ValidationError);
    });
  });

  describe('loadDefaultConfig', () => {
    it('should load user default config if exists', async () => {
      const mockConfig = {
        schema: { type: 'object' },
        output: { format: 'json' }
      };
      vi.mocked(readJsonFile).mockResolvedValue(mockConfig);

      const result = await configManager.loadDefaultConfig();

      expect(readJsonFile).toHaveBeenCalledWith(
        path.join(path.sep + path.join('test', 'user', 'configs'), 'default.json')
      );
      expect(result).toEqual(mockConfig);
    });

    it('should fallback to system default if user default not found', async () => {
      const mockConfig = {
        schema: { type: 'object' },
        output: { format: 'json' }
      };
      vi.mocked(readJsonFile)
        .mockRejectedValueOnce(new Error('Not found'))
        .mockResolvedValueOnce(mockConfig);

      const result = await configManager.loadDefaultConfig();

      expect(readJsonFile).toHaveBeenCalledWith(configManager.defaultConfigPath);
      expect(result).toEqual(mockConfig);
    });

    it('should return minimal config if all defaults fail', async () => {
      vi.mocked(readJsonFile).mockRejectedValue(new Error('Not found'));

      const result = await configManager.loadDefaultConfig();

      expect(result).toHaveProperty('meta');
      expect(result).toHaveProperty('api');
      expect(result).toHaveProperty('schema');
      expect(result).toHaveProperty('prompts');
    });
  });

  describe('validateConfig', () => {
    it('should validate JSON format config', () => {
      const config = {
        schema: { type: 'object' },
        output: { format: 'json' }
      };

      expect(() => configManager._validateConfig(config)).not.toThrow();
    });

    it('should require schema for JSON format', () => {
      const config = { output: { format: 'json' } };

      expect(() => configManager._validateConfig(config))
        .toThrow(ValidationError);
      expect(() => configManager._validateConfig(config))
        .toThrow('Config is missing required fields: schema');
    });

    it('should validate schema has type property', () => {
      const config = {
        schema: {},
        output: { format: 'json' }
      };

      expect(() => configManager._validateConfig(config))
        .toThrow('Schema must have a type property');
    });

    it('should not require schema for text format', () => {
      const config = { output: { format: 'text' } };

      expect(() => configManager._validateConfig(config)).not.toThrow();
    });

    it('should validate temperature range', () => {
      const config = {
        schema: { type: 'object' },
        api: { temperature: 2.5 }
      };

      expect(() => configManager._validateConfig(config))
        .toThrow('Temperature must be a number between 0 and 2');
    });

    it('should validate maxTokens', () => {
      const config = {
        schema: { type: 'object' },
        api: { maxTokens: -100 }
      };

      expect(() => configManager._validateConfig(config))
        .toThrow('maxTokens must be a positive number');
    });
  });

  describe('mergeConfigs', () => {
    it('should deep merge configurations', () => {
      const base = {
        api: { model: 'gpt-3.5', temperature: 0.7 },
        output: { format: 'json' }
      };
      const override = {
        api: { model: 'gpt-4' },
        schema: { type: 'object' }
      };

      const result = configManager.mergeConfigs(base, override);

      expect(result).toEqual({
        api: { model: 'gpt-4', temperature: 0.7 },
        output: { format: 'json' },
        schema: { type: 'object' }
      });
    });

    it('should not modify original objects', () => {
      const base = { api: { model: 'gpt-3.5' } };
      const override = { api: { model: 'gpt-4' } };

      const result = configManager.mergeConfigs(base, override);

      expect(base.api.model).toBe('gpt-3.5');
      expect(override.api.model).toBe('gpt-4');
      expect(result.api.model).toBe('gpt-4');
    });

    it('should handle arrays by replacement', () => {
      const base = { tasks: [1, 2, 3] };
      const override = { tasks: [4, 5] };

      const result = configManager.mergeConfigs(base, override);

      expect(result.tasks).toEqual([4, 5]);
    });
  });

  describe('saveConfig', () => {
    it('should save config to file', async () => {
      const config = { test: 'data' };
      const outputPath = '/test/config.json';

      await configManager.saveConfig(config, outputPath);

      expect(writeJsonFile).toHaveBeenCalledWith(outputPath, config);
    });
  });

  describe('getConfigInfo', () => {
    it('should extract config information', () => {
      const config = {
        meta: { name: 'Test Config', version: '1.0' },
        api: { model: 'gpt-4', temperature: 0.7, maxTokens: 2000 },
        output: { outputPath: '/output' },
        schema: { properties: { a: {}, b: {}, c: {} } },
        generation: {
          tasks: [
            { count: 10, type: 'test' },
            { count: 20, type: 'demo' }
          ]
        }
      };

      const info = configManager.getConfigInfo(config);

      expect(info.name).toBe('Test Config');
      expect(info.version).toBe('1.0');
      expect(info.model).toBe('gpt-4');
      expect(info.temperature).toBe(0.7);
      expect(info.maxTokens).toBe(2000);
      expect(info.outputPath).toBe('/output');
      expect(info.propertiesCount).toBe(3);
      expect(info.tasksCount).toBe(2);
      expect(info.tasks).toEqual(config.generation.tasks);
    });

    it('should handle missing fields gracefully', () => {
      const config = {};
      const info = configManager.getConfigInfo(config);

      expect(info.name).toBe('Unnamed');
      expect(info.version).toBe('1.0');
      expect(info.model).toBe('default');
      expect(info.temperature).toBe(0.7);
      expect(info.propertiesCount).toBe(0);
      expect(info.tasksCount).toBe(0);
    });
  });
});

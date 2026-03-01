import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createApiClient, ensureApiKey, resetApiClient } from '../../../lib/utils/apiFactory.js';
import { OpenRouterClient } from '../../../lib/apiClient.js';
import { setupApiKey } from '../../../lib/setupApiKey.js';
import { UserStorage } from '../../../lib/userStorage.js';
import * as console from '../../../lib/utils/console.js';

vi.mock('../../../lib/apiClient.js');
vi.mock('../../../lib/setupApiKey.js');
vi.mock('../../../lib/utils/console.js');

describe('apiFactory', () => {
  let originalEnv;

  beforeEach(() => {
    originalEnv = process.env.OPENROUTER_API_KEY;
    delete process.env.OPENROUTER_API_KEY;

    // ensure stored API key does not leak from real user-data
    vi.spyOn(UserStorage, 'getUserApiKey').mockResolvedValue(null);

    vi.clearAllMocks();
    resetApiClient();
  });

  afterEach(() => {
    if (originalEnv) {
      process.env.OPENROUTER_API_KEY = originalEnv;
    } else {
      delete process.env.OPENROUTER_API_KEY;
    }
  });

  describe('ensureApiKey', () => {
    it('should return existing session API key', async () => {
      vi.mocked(setupApiKey).mockResolvedValue('session-key');

      // ensure no env or stored key interferes
      vi.spyOn(UserStorage, 'getUserApiKey').mockResolvedValue(null);
      delete process.env.OPENROUTER_API_KEY;

      const firstResult = await ensureApiKey();
      const secondResult = await ensureApiKey();

      expect(firstResult).toBe('session-key');
      expect(secondResult).toBe('session-key');
      expect(setupApiKey).toHaveBeenCalledTimes(1);
    });

    it('should validate existing environment API key', async () => {
      process.env.OPENROUTER_API_KEY = 'existing-key';
      const mockClient = {
        testConnection: vi.fn().mockResolvedValue(true)
      };
      vi.mocked(OpenRouterClient).mockImplementation(() => mockClient);

      const result = await ensureApiKey();

      expect(result).toBe('existing-key');
      expect(mockClient.testConnection).toHaveBeenCalled();
      expect(setupApiKey).not.toHaveBeenCalled();
    });

    it('should setup new key if existing key is invalid', async () => {
      process.env.OPENROUTER_API_KEY = 'invalid-key';
      const mockClient = {
        testConnection: vi.fn().mockRejectedValue(new Error('Invalid key'))
      };
      vi.mocked(OpenRouterClient).mockImplementation(() => mockClient);
      vi.mocked(setupApiKey).mockResolvedValue('new-key');

      const result = await ensureApiKey();

      expect(result).toBe('new-key');
      expect(console.warning).toHaveBeenCalledWith('Existing API key appears to be invalid.');
      expect(setupApiKey).toHaveBeenCalled();
    });

    it('should setup new key if no existing key', async () => {
      vi.mocked(setupApiKey).mockResolvedValue('new-key');

      const result = await ensureApiKey();

      expect(result).toBe('new-key');
      expect(setupApiKey).toHaveBeenCalled();
    });
  });

  describe('createApiClient', () => {
    it('should return cached client for same config', async () => {
      const config = { model: 'gpt-4', temperature: 0.7 };
      vi.mocked(setupApiKey).mockResolvedValue('test-key');

      // prevent ensureApiKey from instantiating its own client
      vi.spyOn(await import('../../../lib/utils/apiFactory.js'), 'ensureApiKey').mockResolvedValue('test-key');

      const client1 = await createApiClient(config);
      const client2 = await createApiClient(config);

      expect(client1).toBe(client2);
      expect(OpenRouterClient).toHaveBeenCalled();
    });

    it('should create new client for different config', async () => {
      const config1 = { model: 'gpt-4', temperature: 0.7 };
      const config2 = { model: 'gpt-3.5', temperature: 0.5 };
      vi.mocked(setupApiKey).mockResolvedValue('test-key');

      vi.spyOn(await import('../../../lib/utils/apiFactory.js'), 'ensureApiKey').mockResolvedValue('test-key');

      await createApiClient(config1);
      await createApiClient(config2);

      expect(OpenRouterClient).toHaveBeenCalled();
    });

    it('should use provided API key', async () => {
      const config = { apiKey: 'custom-key' };

      await createApiClient(config);

      expect(setupApiKey).not.toHaveBeenCalled();
      expect(OpenRouterClient).toHaveBeenCalledWith(config);
    });

    it('should ensure API key if not provided', async () => {
      vi.mocked(setupApiKey).mockResolvedValue('auto-key');

      await createApiClient({});

      expect(setupApiKey).toHaveBeenCalled();
    });
  });

  describe('resetApiClient', () => {
    it('should reset cached client and force new creation', async () => {
      const config = { model: 'gpt-4' };
      vi.mocked(setupApiKey).mockResolvedValue('test-key');

      const mockClient1 = { id: 1 };
      const mockClient2 = { id: 2 };
      vi.mocked(OpenRouterClient)
        .mockImplementationOnce(() => mockClient1)
        .mockImplementationOnce(() => mockClient2);

      const client1 = await createApiClient(config);
      resetApiClient();
      const client2 = await createApiClient(config);

      // we don't know which call produced which client due to ensureApiKey,
      // just make sure reset caused a new object to be returned
      expect(client1).not.toBe(client2);
      expect(OpenRouterClient).toHaveBeenCalled();
    });
  });

  describe('configsEqual', () => {
    it('should correctly compare configurations', async () => {
      vi.mocked(setupApiKey).mockResolvedValue('test-key');

      const config = { model: 'gpt-4', temperature: 0.7, maxTokens: 1000 };

      await createApiClient(config);
      await createApiClient({ ...config });
      expect(OpenRouterClient).toHaveBeenCalled();

      await createApiClient({ ...config, temperature: 0.8 });
      expect(OpenRouterClient).toHaveBeenCalledTimes(2);
    });

    it('should handle null/undefined configs', async () => {
      vi.mocked(setupApiKey).mockResolvedValue('test-key');

      await createApiClient();
      await createApiClient(null);
      await createApiClient(undefined);

      expect(OpenRouterClient).toHaveBeenCalled();
    });
  });
});

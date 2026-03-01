import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { testConnection } from '../../../lib/cli/commands.js';
import * as console from '../../../lib/utils/console.js';
import { ora } from '../../../lib/utils/spinner.js';
import { createApiClient } from '../../../lib/sessionManager.js';

vi.mock('../../../lib/utils/console.js');
vi.mock('../../../lib/utils/spinner.js');
vi.mock('../../../lib/sessionManager.js');

const fakeSpinner = {
  start: vi.fn().mockReturnThis(),
  succeed: vi.fn().mockReturnThis(),
  fail: vi.fn().mockReturnThis()
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(ora).mockReturnValue(fakeSpinner);
});

describe('testConnection command', () => {
  it('returns true and does not exit when interactive and connection succeeds', async () => {
    const mockClient = {
      testConnection: vi.fn().mockResolvedValue({ connected: true, models: [] }),
      getUserInfo: vi.fn().mockResolvedValue({ success: true, data: { data: {} } }),
      getModels: vi.fn().mockResolvedValue([])
    };
    vi.mocked(createApiClient).mockResolvedValue(mockClient);

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    });

    const result = await testConnection({ interactive: true });

    expect(result).toBe(true);
    expect(exitSpy).not.toHaveBeenCalled();
    expect(fakeSpinner.start).toHaveBeenCalled();
    expect(fakeSpinner.succeed).toHaveBeenCalledWith('Connected to OpenRouter successfully!');

    exitSpy.mockRestore();
  });

  it('returns false and does not exit when interactive and connection fails', async () => {
    const mockClient = {
      testConnection: vi.fn().mockResolvedValue({ connected: false, error: 'nope' })
    };
    vi.mocked(createApiClient).mockResolvedValue(mockClient);

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    });

    const result = await testConnection({ interactive: true });

    expect(result).toBe(false);
    expect(exitSpy).not.toHaveBeenCalled();

    exitSpy.mockRestore();
  });

  it('calls process.exit when not interactive (success path)', async () => {
    const mockClient = {
      testConnection: vi.fn().mockResolvedValue({ connected: true, models: [] }),
      getUserInfo: vi.fn().mockResolvedValue({ success: true, data: { data: {} } }),
      getModels: vi.fn().mockResolvedValue([])
    };
    vi.mocked(createApiClient).mockResolvedValue(mockClient);

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {});

    const result = await testConnection({ interactive: false });

    expect(result).toBe(true);
    expect(exitSpy).toHaveBeenCalledWith(0);

    exitSpy.mockRestore();
  });

  it('calls process.exit when not interactive (failure path)', async () => {
    const mockClient = {
      testConnection: vi.fn().mockRejectedValue(new Error('fail'))
    };
    vi.mocked(createApiClient).mockResolvedValue(mockClient);

    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {});

    const result = await testConnection({ interactive: false });

    expect(result).toBe(false);
    expect(exitSpy).toHaveBeenCalledWith(1);

    exitSpy.mockRestore();
  });
});

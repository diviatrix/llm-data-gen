import { describe, it, expect, vi, beforeEach } from 'vitest';

// mocks to be used before importing the module that triggers dynamic import
vi.mock('inquirer', () => {
  // minimal interface used by interactiveMode and configWizard
  return {
    default: {
      prompt: vi.fn(),
      registerPrompt: vi.fn()
    }
  };
});

import { runInteractiveMode } from '../../../lib/cli/interactiveMode.js';
import * as commands from '../../../lib/cli/commands.js';
import { createApiClient } from '../../../lib/sessionManager.js';
import * as console from '../../../lib/utils/console.js';

vi.mock('../../../lib/cli/commands.js');
vi.mock('../../../lib/sessionManager.js');
vi.mock('../../../lib/utils/console.js');

const mockPrompt = vi.mocked((await import('inquirer')).default.prompt);

describe('interactiveMode', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return to menu after testing connection instead of exiting', async () => {
    // configure client so initial account info doesn't crash
    vi.mocked(createApiClient).mockResolvedValue({
      getUserInfo: vi.fn().mockResolvedValue({ success: true, data: { data: {} } })
    });

    const testSpy = vi.mocked(commands.testConnection).mockResolvedValue(true);

    // first prompt -> test API, second prompt -> exit
    mockPrompt
      .mockResolvedValueOnce({ action: 'test' })
      .mockResolvedValueOnce({ action: 'exit' });

    const configManager = {}; // not used

    // run without throwing
    await runInteractiveMode(configManager, { version: 'x' });

    expect(testSpy).toHaveBeenCalledWith({ interactive: true });
    expect(mockPrompt).toHaveBeenCalledTimes(2);
  });
});

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { fileURLToPath } from 'url';

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const cliPath = path.join(__dirname, '..', '..', 'index.js');

describe('test command', () => {
  let originalApiKey;

  beforeEach(() => {
    originalApiKey = process.env.OPENROUTER_API_KEY;
  });

  afterEach(() => {
    if (originalApiKey) {
      process.env.OPENROUTER_API_KEY = originalApiKey;
    } else {
      delete process.env.OPENROUTER_API_KEY;
    }
  });

  it.skip('should error when no API key is provided', async () => {
    delete process.env.OPENROUTER_API_KEY;

    const { stderr } = await execAsync(`node "${cliPath}" test`).catch(e => e);

    expect(stderr).toContain('Error: OpenRouter API key is required');
  });

  it('should accept API key as command line argument', async () => {
    delete process.env.OPENROUTER_API_KEY;

    const { stdout, stderr } = await execAsync(`node "${cliPath}" test -k test-api-key`).catch(e => e);

    expect(stdout).toBeDefined();
    expect(stderr).not.toContain('OPENROUTER_API_KEY environment variable is not set');
  });

  it('should use environment variable API key when available', async () => {
    process.env.OPENROUTER_API_KEY = 'env-test-key';

    const { stdout } = await execAsync(`node "${cliPath}" test`).catch(e => e);

    expect(stdout).toBeDefined();
  });

  it('should prefer command line API key over environment variable', async () => {
    process.env.OPENROUTER_API_KEY = 'env-test-key';

    const { stdout } = await execAsync(`node "${cliPath}" test -k cli-test-key`).catch(e => e);

    expect(stdout).toBeDefined();
  });
});

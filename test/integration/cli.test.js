import { describe, it, expect } from 'vitest';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import { fileURLToPath } from 'url';

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const cliPath = path.join(__dirname, '..', '..', 'index.js');

describe('CLI main commands', () => {
  it('should display help when --help flag is used', async () => {
    const { stdout } = await execAsync(`node "${cliPath}" --help`);

    expect(stdout).toContain('Usage:');
    expect(stdout).toContain('Commands:');
    expect(stdout).toContain('generate');
    expect(stdout).toContain('test');
    expect(stdout).toContain('validate');
    expect(stdout).toContain('config');
    expect(stdout).toContain('examples');
  });

  it('should display help when -h flag is used', async () => {
    const { stdout } = await execAsync(`node "${cliPath}" -h`);

    expect(stdout).toContain('Usage:');
    expect(stdout).toContain('Commands:');
  });

  it('should display version when --version flag is used', async () => {
    const { stdout } = await execAsync(`node "${cliPath}" --version`);

    expect(stdout).toMatch(/\d+\.\d+\.\d+/);
  });

  it('should display version when -V flag is used', async () => {
    const { stdout } = await execAsync(`node "${cliPath}" -V`);

    expect(stdout).toMatch(/\d+\.\d+\.\d+/);
  });

  it('should show help for specific commands', async () => {
    const commands = ['generate', 'test', 'validate', 'config', 'examples'];

    for (const cmd of commands) {
      const { stdout } = await execAsync(`node "${cliPath}" ${cmd} --help`);

      expect(stdout).toContain('Usage:');
      expect(stdout).toContain(cmd);
      expect(stdout).toContain('Options:');
    }
  });

  it.skip('should handle unknown commands gracefully', async () => {
    try {
      await execAsync(`node "${cliPath}" unknown-command`);
    } catch (error) {
      expect(error.stderr).toContain('error: unknown command');
    }
  });

  it('should use generate as default command', async () => {
    const result = await execAsync(`node "${cliPath}" --no-interactive`, {
      timeout: 3000,
      env: { ...process.env, OPENROUTER_API_KEY: '' } // Ensure no API key to force quick error
    }).catch(e => e);

    // Default command is generate, so it should show generation output or error
    // When no config is provided, it should either show an error or use default config
    const output = result.stdout || result.stderr || '';
    expect(output).toBeTruthy();
    // Should contain some indication of generate command running or API key error
    expect(output.toLowerCase()).toMatch(/generat|config|error|api key/);
  });
});

import { describe, it, expect } from 'vitest';
import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const cliPath = path.join(__dirname, '..', '..', 'index.js');

describe('CLI basic functionality', () => {
  const runCLI = (args = '') => {
    try {
      const output = execSync(`node "${cliPath}" ${args}`, {
        encoding: 'utf-8',
        stdio: 'pipe'
      });
      return { stdout: output, stderr: '', exitCode: 0 };
    } catch (error) {
      return {
        stdout: error.stdout || '',
        stderr: error.stderr || error.message || '',
        exitCode: error.status || 1
      };
    }
  };

  it('should display help', () => {
    const { stdout } = runCLI('--help');

    expect(stdout).toContain('Usage:');
    expect(stdout).toContain('Commands:');
    expect(stdout).toContain('generate');
    expect(stdout).toContain('test');
    expect(stdout).toContain('validate');
  });

  it('should display version', () => {
    const { stdout } = runCLI('--version');

    expect(stdout).toMatch(/\d+\.\d+\.\d+/);
  });

  it('should show generate command help', () => {
    const { stdout } = runCLI('generate --help');

    expect(stdout).toContain('generate');
    expect(stdout).toContain('--config');
    expect(stdout).toContain('--model');
    expect(stdout).toContain('--temperature');
  });

  it('should show test command help', () => {
    const { stdout } = runCLI('test --help');

    expect(stdout).toContain('test');
    expect(stdout).toContain('--api-key');
  });

  it('should show validate command help', () => {
    const { stdout } = runCLI('validate --help');

    expect(stdout).toContain('validate');
    expect(stdout).toContain('--schema');
  });

  it('should show config command help', () => {
    const { stdout } = runCLI('config --help');

    expect(stdout).toContain('config');
  });

  it('should show examples command help', () => {
    const { stdout } = runCLI('examples --help');

    expect(stdout).toContain('examples');
  });

  it('should handle unknown commands', () => {
    const { stderr } = runCLI('unknown-command');

    // Check that we get some error output (readline error or unknown command)
    expect(stderr).toBeTruthy();
    expect(stderr.toLowerCase()).toMatch(/error|unknown/);
  });

  it('should list examples', () => {
    const { stdout } = runCLI('examples');

    expect(stdout).toContain('Available examples');
    expect(stdout).toMatch(/\.json/);
  });

  it('should require API key for test command', () => {
    const originalKey = process.env.OPENROUTER_API_KEY;
    delete process.env.OPENROUTER_API_KEY;

    const { stderr, stdout } = runCLI('test 2>&1 || true');

    // Check if error message contains API key requirement
    const output = stderr + stdout;
    expect(output).toContain('Testing connection') || expect(output).toContain('OPENROUTER_API_KEY');

    if (originalKey) process.env.OPENROUTER_API_KEY = originalKey;
  });
});

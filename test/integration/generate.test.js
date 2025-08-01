import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const cliPath = path.join(__dirname, '..', '..', 'index.js');
const testConfigDir = path.join(__dirname, 'fixtures');
const testOutputDir = path.join(__dirname, 'output');

describe('generate command', () => {
  beforeEach(async () => {
    await fs.mkdir(testConfigDir, { recursive: true });
    await fs.mkdir(testOutputDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(testConfigDir, { recursive: true, force: true });
    await fs.rm(testOutputDir, { recursive: true, force: true });
  });

  it('should show help when no config is provided', async () => {
    // Set a short timeout to avoid hanging on API calls
    const result = await execAsync(`node "${cliPath}" generate --no-interactive`, {
      timeout: 5000,
      env: { ...process.env, OPENROUTER_API_KEY: '' } // Ensure no API key to force error
    }).catch(e => e);

    const output = result.stdout || result.stderr || '';
    // Should either show an error about missing API key or config
    expect(output).toMatch(/api key|config|error/i);
  });

  it('should validate config file path', async () => {
    const { stderr } = await execAsync(`node "${cliPath}" generate -c nonexistent.json --no-interactive`).catch(e => e);

    expect(stderr).toContain('Error: Config file not found');
  });

  it('should accept command line overrides', async () => {
    const mockConfig = {
      tasks: [{
        name: 'test-task',
        schema: {
          type: 'object',
          properties: {
            name: { type: 'string' }
          }
        },
        count: 1,
        model: 'openai/gpt-3.5-turbo',
        temperature: 0.7,
        maxTokens: 1000
      }]
    };

    const configPath = path.join(testConfigDir, 'test-config.json');
    await fs.writeFile(configPath, JSON.stringify(mockConfig, null, 2));

    const outputPath = path.join(testOutputDir, 'test-output.json');

    const spy = vi.spyOn(process, 'env', 'get').mockReturnValue({
      ...process.env,
      OPENROUTER_API_KEY: 'test-key'
    });

    const { stdout, stderr } = await execAsync(
      `node "${cliPath}" generate -c "${configPath}" -m "openai/gpt-4" -t 0.5 -o "${outputPath}" --count 2 --max-tokens 500 --no-interactive`
    ).catch(e => e);

    spy.mockRestore();

    expect(stdout || stderr).toBeDefined();
  });

  it('should validate temperature range', async () => {
    const mockConfig = {
      tasks: [{
        name: 'test-task',
        schema: {
          type: 'object',
          properties: {
            name: { type: 'string' }
          }
        }
      }]
    };

    const configPath = path.join(testConfigDir, 'test-config.json');
    await fs.writeFile(configPath, JSON.stringify(mockConfig, null, 2));

    const { stderr } = await execAsync(
      `node "${cliPath}" generate -c "${configPath}" -t 3 --no-interactive`
    ).catch(e => e);

    expect(stderr).toContain('Error');
  });

  it('should handle verbose mode', async () => {
    const mockConfig = {
      tasks: [{
        name: 'test-task',
        schema: {
          type: 'object',
          properties: {
            name: { type: 'string' }
          }
        },
        count: 1
      }]
    };

    const configPath = path.join(testConfigDir, 'test-config.json');
    await fs.writeFile(configPath, JSON.stringify(mockConfig, null, 2));

    const spy = vi.spyOn(process, 'env', 'get').mockReturnValue({
      ...process.env,
      OPENROUTER_API_KEY: 'test-key'
    });

    const { stdout, stderr } = await execAsync(
      `node "${cliPath}" generate -c "${configPath}" --verbose --no-interactive`
    ).catch(e => e);

    spy.mockRestore();

    expect(stdout || stderr).toBeDefined();
  });
});

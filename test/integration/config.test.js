import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const cliPath = path.join(__dirname, '..', '..', 'index.js');
describe('create command', () => {
  let testDir;

  beforeEach(async () => {
    testDir = path.join(__dirname, `fixtures-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    if (testDir) {
      await fs.rm(testDir, { recursive: true, force: true });
    }
  });

  it('should create a new configuration file', async () => {
    const configPath = path.join(testDir, 'new-config.json');

    const result = await execAsync(`node "${cliPath}" create basic -o "${configPath}"`).catch(e => ({ stdout: e.stdout || '', stderr: e.stderr || e.message }));
    const { stdout, stderr } = result;

    if (stderr && !stdout) {
      throw new Error(`Command failed: ${stderr}`);
    }

    expect(stdout || '').toContain('Created basic config');

    const exists = await fs.access(configPath).then(() => true).catch(() => false);
    expect(exists).toBe(true);

    const content = await fs.readFile(configPath, 'utf-8');
    const config = JSON.parse(content);
    expect(config).toHaveProperty('generation');
    expect(config.generation).toHaveProperty('tasks');
    expect(Array.isArray(config.generation.tasks)).toBe(true);
  });

  it('should overwrite existing configuration file', async () => {
    const configPath = path.join(testDir, 'existing-config.json');
    const originalContent = { existing: true };

    await fs.writeFile(configPath, JSON.stringify(originalContent));

    const result = await execAsync(`node "${cliPath}" create basic -o "${configPath}"`).catch(e => ({ stdout: e.stdout || '', stderr: e.stderr || e.message }));
    const { stdout, stderr } = result;

    if (stderr && !stdout) {
      throw new Error(`Command failed: ${stderr}`);
    }

    expect(stdout || '').toContain('Created basic config');

    const exists = await fs.access(configPath).then(() => true).catch(() => false);
    expect(exists).toBe(true);

    const content = await fs.readFile(configPath, 'utf-8');
    const config = JSON.parse(content);
    expect(config).toHaveProperty('meta');
    expect(config).not.toEqual(originalContent);
  });

  it('should create directories if they do not exist', async () => {
    const configPath = path.join(testDir, 'nonexistent', 'dir', 'config.json');

    const result = await execAsync(`node "${cliPath}" create basic -o "${configPath}"`).catch(e => ({ stdout: e.stdout || '', stderr: e.stderr || e.message }));
    const { stdout, stderr } = result;

    if (stderr) {
      console.error('Command stderr:', stderr);
    }

    expect(stdout || '').toContain('Created basic config');

    // Wait a bit for file to be written
    await new Promise(resolve => setTimeout(resolve, 100));

    const exists = await fs.access(configPath).then(() => true).catch(() => false);
    expect(exists).toBe(true);
  });
});

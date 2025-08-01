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
describe('examples command', () => {
  let testDir;

  beforeEach(async () => {
    testDir = path.join(__dirname, `fixtures-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    if (testDir) {
      try {
        await fs.rm(testDir, { recursive: true, force: true });
      } catch (err) {
        // Ignore cleanup errors
      }
    }
  });

  it('should list available examples', async () => {
    const { stdout } = await execAsync(`node "${cliPath}" examples`);

    expect(stdout).toContain('Available examples');
  });

  it('should work with alias "list"', async () => {
    const { stdout } = await execAsync(`node "${cliPath}" list`);

    expect(stdout).toContain('Available examples');
  });

  it('should show help for examples command', async () => {
    const { stdout } = await execAsync(`node "${cliPath}" examples --help`);

    expect(stdout).toContain('List available example configurations');
    expect(stdout).toContain('Usage:');
  });

  it('should handle invalid options gracefully', async () => {
    const { stderr } = await execAsync(`node "${cliPath}" examples --invalid-option`).catch(e => e);

    expect(stderr).toContain('error: unknown option');
  });

  it('should create example config using create command', async () => {
    const outputPath = path.join(testDir, 'example-config.json');

    const { stdout } = await execAsync(`node "${cliPath}" create basic -o "${outputPath}"`);

    expect(stdout).toContain('Created basic config');

    const exists = await fs.access(outputPath).then(() => true).catch(() => false);
    expect(exists).toBe(true);
  });

  it('should handle create command with invalid type', async () => {
    const outputPath = path.join(testDir, 'invalid.json');

    const { stdout } = await execAsync(`node "${cliPath}" create invalid-type -o "${outputPath}"`);

    // Invalid type should create basic config as fallback
    expect(stdout).toContain('Created invalid-type config');

    const exists = await fs.access(outputPath).then(() => true).catch(() => false);
    expect(exists).toBe(true);
  });
});

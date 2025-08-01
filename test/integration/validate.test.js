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
const testDir = path.join(process.cwd(), 'test-temp-validate');

describe('validate command', () => {
  beforeEach(async () => {
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch (err) {
      // Ignore cleanup errors
    }
  });

  it('should require schema file argument', async () => {
    const dataFile = path.join(testDir, 'data.json');
    await fs.writeFile(dataFile, '{}');

    const result = await execAsync(`node "${cliPath}" validate "${dataFile}"`, { timeout: 5000 }).catch(e => e);

    expect(result.stderr).toContain('required option');
  });

  it('should validate valid data against schema', async () => {
    const schema = {
      type: 'object',
      properties: {
        name: { type: 'string' },
        age: { type: 'number' }
      },
      required: ['name']
    };

    const validData = {
      name: 'John Doe',
      age: 30
    };

    const schemaFile = path.join(testDir, 'schema.json');
    const dataFile = path.join(testDir, 'data.json');

    await fs.writeFile(schemaFile, JSON.stringify(schema, null, 2));
    await fs.writeFile(dataFile, JSON.stringify(validData, null, 2));

    // Verify files exist
    const schemaExists = await fs.access(schemaFile).then(() => true).catch(() => false);
    const dataExists = await fs.access(dataFile).then(() => true).catch(() => false);
    expect(schemaExists).toBe(true);
    expect(dataExists).toBe(true);

    const { stdout } = await execAsync(`node "${cliPath}" validate "${dataFile}" -s "${schemaFile}"`);

    expect(stdout).toContain('✓ Valid: 1');
  });

  it('should report validation errors for invalid data', async () => {
    const schema = {
      type: 'object',
      properties: {
        name: { type: 'string' },
        age: { type: 'number', minimum: 0 }
      },
      required: ['name', 'age']
    };

    const invalidData = {
      age: -5
    };

    const schemaFile = path.join(testDir, 'schema.json');
    const dataFile = path.join(testDir, 'data.json');

    await fs.writeFile(schemaFile, JSON.stringify(schema, null, 2));
    await fs.writeFile(dataFile, JSON.stringify(invalidData, null, 2));

    // Verify files exist
    const schemaExists = await fs.access(schemaFile).then(() => true).catch(() => false);
    const dataExists = await fs.access(dataFile).then(() => true).catch(() => false);
    expect(schemaExists).toBe(true);
    expect(dataExists).toBe(true);

    const { stdout } = await execAsync(`node "${cliPath}" validate "${dataFile}" -s "${schemaFile}"`);

    expect(stdout).toContain('✗ Invalid: 1');
    expect(stdout).toContain('Invalid items:');
  });

  it('should handle non-existent data file', async () => {
    const schemaFile = path.join(testDir, 'schema.json');
    await fs.writeFile(schemaFile, '{}');

    const { stderr } = await execAsync(`node "${cliPath}" validate nonexistent.json -s "${schemaFile}"`).catch(e => e);

    expect(stderr).toContain('Failed to validate file');
  });

  it('should handle non-existent schema file', async () => {
    const dataFile = path.join(testDir, 'data.json');
    await fs.writeFile(dataFile, '{}');

    const { stderr } = await execAsync(`node "${cliPath}" validate "${dataFile}" -s nonexistent.json`).catch(e => e);

    expect(stderr).toContain('File not found');
  });

  it('should handle invalid JSON in data file', async () => {
    const schemaFile = path.join(testDir, 'schema.json');
    const dataFile = path.join(testDir, 'data.json');

    await fs.writeFile(schemaFile, '{}');
    await fs.writeFile(dataFile, 'invalid json');

    const { stderr } = await execAsync(`node "${cliPath}" validate "${dataFile}" -s "${schemaFile}"`).catch(e => e);

    expect(stderr).toContain('Failed to validate file');
  });

  it('should handle invalid JSON in schema file', async () => {
    const schemaFile = path.join(testDir, 'schema.json');
    const dataFile = path.join(testDir, 'data.json');

    await fs.writeFile(schemaFile, 'invalid json');
    await fs.writeFile(dataFile, '{}');

    const { stderr } = await execAsync(`node "${cliPath}" validate "${dataFile}" -s "${schemaFile}"`).catch(e => e);

    expect(stderr).toContain('Invalid JSON');
  });
});

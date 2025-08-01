import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import {
  readJsonFile,
  writeJsonFile,
  fileExists,
  ensureDir,
  readDir,
  removeFile
} from '../../../lib/utils/fileIO.js';
import { AppError } from '../../../lib/utils/errors.js';

vi.mock('fs/promises');

describe('fileIO utilities', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('readJsonFile', () => {
    it('should read and parse JSON file', async () => {
      const mockData = { test: 'data', value: 123 };
      vi.mocked(fs.readFile).mockResolvedValue(JSON.stringify(mockData));

      const result = await readJsonFile('/test/file.json');

      expect(fs.readFile).toHaveBeenCalledWith('/test/file.json', 'utf-8');
      expect(result).toEqual(mockData);
    });

    it('should throw AppError for non-existent file', async () => {
      const error = new Error('ENOENT');
      error.code = 'ENOENT';
      vi.mocked(fs.readFile).mockRejectedValue(error);

      await expect(readJsonFile('/missing.json')).rejects.toThrow(AppError);
      await expect(readJsonFile('/missing.json')).rejects.toThrow('File not found');
    });

    it('should throw AppError for invalid JSON', async () => {
      vi.mocked(fs.readFile).mockResolvedValue('invalid json {');

      await expect(readJsonFile('/invalid.json')).rejects.toThrow(AppError);
      await expect(readJsonFile('/invalid.json')).rejects.toThrow('Invalid JSON');
    });

    it('should throw AppError for other read errors', async () => {
      vi.mocked(fs.readFile).mockRejectedValue(new Error('Permission denied'));

      await expect(readJsonFile('/protected.json')).rejects.toThrow(AppError);
      await expect(readJsonFile('/protected.json')).rejects.toThrow('Failed to read file');
    });
  });

  describe('writeJsonFile', () => {
    it('should write JSON file with proper formatting', async () => {
      const data = { test: 'data', nested: { value: 123 } };

      await writeJsonFile('/test/output.json', data);

      expect(fs.mkdir).toHaveBeenCalledWith(path.dirname('/test/output.json'), { recursive: true });
      expect(fs.writeFile).toHaveBeenCalledWith(
        '/test/output.json',
        JSON.stringify(data, null, 2),
        'utf-8'
      );
    });

    it('should write without creating directory if createDir is false', async () => {
      const data = { test: 'data' };

      await writeJsonFile('/test/output.json', data, { createDir: false });

      expect(fs.mkdir).not.toHaveBeenCalled();
      expect(fs.writeFile).toHaveBeenCalled();
    });

    it('should throw AppError on write failure', async () => {
      vi.mocked(fs.writeFile).mockRejectedValue(new Error('Disk full'));

      await expect(writeJsonFile('/test/output.json', {})).rejects.toThrow(AppError);
      await expect(writeJsonFile('/test/output.json', {})).rejects.toThrow('Failed to write file');
    });
  });

  describe('fileExists', () => {
    it('should return true for existing file', async () => {
      vi.mocked(fs.access).mockResolvedValue(undefined);

      const exists = await fileExists('/existing/file.txt');

      expect(exists).toBe(true);
      expect(fs.access).toHaveBeenCalledWith('/existing/file.txt');
    });

    it('should return false for non-existing file', async () => {
      vi.mocked(fs.access).mockRejectedValue(new Error('ENOENT'));

      const exists = await fileExists('/missing/file.txt');

      expect(exists).toBe(false);
    });
  });

  describe('ensureDir', () => {
    it('should create directory recursively', async () => {
      await ensureDir('/test/nested/dir');

      expect(fs.mkdir).toHaveBeenCalledWith('/test/nested/dir', { recursive: true });
    });

    it('should throw AppError on failure', async () => {
      vi.mocked(fs.mkdir).mockRejectedValue(new Error('Permission denied'));

      await expect(ensureDir('/protected/dir')).rejects.toThrow(AppError);
      await expect(ensureDir('/protected/dir')).rejects.toThrow('Failed to create directory');
    });
  });

  describe('readDir', () => {
    it('should return directory contents', async () => {
      const files = ['file1.txt', 'file2.json', 'subdir'];
      vi.mocked(fs.readdir).mockResolvedValue(files);

      const result = await readDir('/test/dir');

      expect(result).toEqual(files);
      expect(fs.readdir).toHaveBeenCalledWith('/test/dir');
    });

    it('should return empty array for non-existent directory', async () => {
      const error = new Error('ENOENT');
      error.code = 'ENOENT';
      vi.mocked(fs.readdir).mockRejectedValue(error);

      const result = await readDir('/missing/dir');

      expect(result).toEqual([]);
    });

    it('should throw AppError for other errors', async () => {
      vi.mocked(fs.readdir).mockRejectedValue(new Error('Permission denied'));

      await expect(readDir('/protected/dir')).rejects.toThrow(AppError);
      await expect(readDir('/protected/dir')).rejects.toThrow('Failed to read directory');
    });
  });

  describe('removeFile', () => {
    it('should remove existing file', async () => {
      await removeFile('/test/file.txt');

      expect(fs.unlink).toHaveBeenCalledWith('/test/file.txt');
    });

    it('should not throw for non-existent file', async () => {
      const error = new Error('ENOENT');
      error.code = 'ENOENT';
      vi.mocked(fs.unlink).mockRejectedValue(error);

      await expect(removeFile('/missing/file.txt')).resolves.not.toThrow();
    });

    it('should throw AppError for other errors', async () => {
      vi.mocked(fs.unlink).mockRejectedValue(new Error('Permission denied'));

      await expect(removeFile('/protected/file.txt')).rejects.toThrow(AppError);
      await expect(removeFile('/protected/file.txt')).rejects.toThrow('Failed to remove file');
    });
  });
});

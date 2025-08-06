import fs from 'node:fs/promises';
import path from 'node:path';
import { AppError } from './errors.js';

export async function readJsonFile(filePath) {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new AppError(`File not found: ${filePath}`, 'FILE_NOT_FOUND');
    }
    if (error instanceof SyntaxError) {
      throw new AppError(`Invalid JSON in file: ${filePath}`, 'INVALID_JSON');
    }
    throw new AppError(`Failed to read file: ${error.message}`, 'FILE_READ_ERROR');
  }
}

export async function writeJsonFile(filePath, data, { createDir = true } = {}) {
  try {
    if (createDir) {
      await fs.mkdir(path.dirname(filePath), { recursive: true });
    }

    const content = JSON.stringify(data, null, 2);
    await fs.writeFile(filePath, content, 'utf-8');
  } catch (error) {
    throw new AppError(`Failed to write file: ${error.message}`, 'FILE_WRITE_ERROR');
  }
}

export async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function ensureDir(dirPath) {
  try {
    await fs.mkdir(dirPath, { recursive: true });
  } catch (error) {
    throw new AppError(`Failed to create directory: ${error.message}`, 'DIR_CREATE_ERROR');
  }
}

export async function readDir(dirPath) {
  try {
    return await fs.readdir(dirPath);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return [];
    }
    throw new AppError(`Failed to read directory: ${error.message}`, 'DIR_READ_ERROR');
  }
}

export async function removeFile(filePath) {
  try {
    await fs.unlink(filePath);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      throw new AppError(`Failed to remove file: ${error.message}`, 'FILE_REMOVE_ERROR');
    }
  }
}

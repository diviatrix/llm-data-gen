import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  AppError,
  ConfigError,
  ValidationError,
  ApiError,
  handleError,
  handleAsyncError
} from '../../../lib/utils/errors.js';

describe('Error Classes', () => {
  describe('AppError', () => {
    it('should create error with default values', () => {
      const error = new AppError('Test error');
      expect(error.message).toBe('Test error');
      expect(error.code).toBe('GENERIC_ERROR');
      expect(error.exitCode).toBe(1);
      expect(error.name).toBe('AppError');
    });

    it('should create error with custom values', () => {
      const error = new AppError('Custom error', 'CUSTOM_CODE', 2);
      expect(error.message).toBe('Custom error');
      expect(error.code).toBe('CUSTOM_CODE');
      expect(error.exitCode).toBe(2);
    });
  });

  describe('ConfigError', () => {
    it('should create config error', () => {
      const error = new ConfigError('Config missing');
      expect(error.message).toBe('Config missing');
      expect(error.code).toBe('CONFIG_ERROR');
      expect(error.name).toBe('ConfigError');
    });
  });

  describe('ValidationError', () => {
    it('should create validation error without errors array', () => {
      const error = new ValidationError('Invalid data');
      expect(error.message).toBe('Invalid data');
      expect(error.code).toBe('VALIDATION_ERROR');
      expect(error.errors).toEqual([]);
    });

    it('should create validation error with errors array', () => {
      const errors = ['Field1 is required', 'Field2 must be number'];
      const error = new ValidationError('Validation failed', errors);
      expect(error.errors).toEqual(errors);
    });
  });

  describe('ApiError', () => {
    it('should create API error without status code', () => {
      const error = new ApiError('API failed');
      expect(error.message).toBe('API failed');
      expect(error.code).toBe('API_ERROR');
      expect(error.statusCode).toBe(500); // Default value
    });

    it('should create API error with status code', () => {
      const error = new ApiError('Not found', { status: 404 });
      expect(error.statusCode).toBe(404);
    });
  });
});

describe('handleError', () => {
  let mockConsoleError;
  let mockProcessExit;

  beforeEach(() => {
    mockConsoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockProcessExit = vi.spyOn(process, 'exit').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should handle basic error', () => {
    const error = new Error('Test error');
    handleError(error);

    expect(mockConsoleError).toHaveBeenCalledWith(expect.stringContaining('❌ Error: Test error'));
    expect(mockProcessExit).toHaveBeenCalledWith(1);
  });

  it('should handle AppError with custom exit code', () => {
    const error = new AppError('App error', 'CODE', 3);
    handleError(error);

    expect(mockProcessExit).toHaveBeenCalledWith(3);
  });

  it('should handle ValidationError with errors', () => {
    const error = new ValidationError('Validation failed', ['Error 1', 'Error 2']);
    handleError(error);

    expect(mockConsoleError).toHaveBeenCalledWith(expect.stringContaining('Validation errors:'));
    expect(mockConsoleError).toHaveBeenCalledWith('  - Error 1');
    expect(mockConsoleError).toHaveBeenCalledWith('  - Error 2');
  });

  it('should show stack trace in verbose mode', () => {
    const error = new Error('Test error');
    error.stack = 'Error: Test error\n    at test.js:1:1';
    handleError(error, { verbose: true });

    expect(mockConsoleError).toHaveBeenCalledWith(expect.stringContaining('at test.js:1:1'));
  });

  it('should handle spinner fail', () => {
    const mockSpinner = { fail: vi.fn() };
    const error = new Error('Spinner error');
    handleError(error, { spinner: mockSpinner });

    expect(mockSpinner.fail).toHaveBeenCalledWith('Spinner error');
  });
});

describe('handleAsyncError', () => {
  let mockHandleError;

  beforeEach(() => {
    mockHandleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(process, 'exit').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should wrap async function and handle errors', async () => {
    const asyncFn = async () => {
      throw new Error('Async error');
    };

    const wrapped = handleAsyncError(asyncFn);
    await wrapped();

    expect(mockHandleError).toHaveBeenCalled();
  });

  it('should pass through successful results', async () => {
    const asyncFn = async (a, b) => a + b;
    const wrapped = handleAsyncError(asyncFn);
    const result = await wrapped(2, 3);

    expect(result).toBe(5);
  });
});

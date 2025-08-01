import chalk from 'chalk';

export class AppError extends Error {
  constructor(message, code = 'GENERIC_ERROR', exitCode = 1) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.exitCode = exitCode;
  }
}

export class ConfigError extends AppError {
  constructor(message) {
    super(message, 'CONFIG_ERROR');
    this.name = 'ConfigError';
  }
}

export class ValidationError extends AppError {
  constructor(message, errors = []) {
    super(message, 'VALIDATION_ERROR');
    this.name = 'ValidationError';
    this.errors = errors;
  }
}

export class ApiError extends AppError {
  constructor(message, statusCode = null) {
    super(message, 'API_ERROR');
    this.name = 'ApiError';
    this.statusCode = statusCode;
  }
}

export function handleError(error, { spinner = null, verbose = false } = {}) {
  if (spinner) {
    spinner.fail(error.message);
  }

  console.error(chalk.red(`\n❌ Error: ${error.message}`));

  if (verbose && error.stack) {
    console.error(chalk.gray(error.stack));
  }

  if (error instanceof ValidationError && error.errors.length > 0) {
    console.error(chalk.yellow('\nValidation errors:'));
    error.errors.forEach(err => console.error(`  - ${err}`));
  }

  process.exit(error.exitCode || 1);
}

export function handleAsyncError(fn) {
  return async (...args) => {
    try {
      return await fn(...args);
    } catch (error) {
      handleError(error);
    }
  };
}

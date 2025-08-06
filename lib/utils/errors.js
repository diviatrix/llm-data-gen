export class ApplicationError extends Error {
  constructor(message, code = 'GENERIC_ERROR', statusCode = 500, context = {}) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    this.context = context;
    this.timestamp = new Date().toISOString();
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      statusCode: this.statusCode,
      timestamp: this.timestamp,
      context: this.context,
      stack: this.stack
    };
  }

  toString() {
    const contextStr = Object.keys(this.context).length > 0
      ? `\nContext: ${JSON.stringify(this.context, null, 2)}`
      : '';
    return `${this.name} [${this.code}]: ${this.message}${contextStr}`;
  }
}

export class AppError extends ApplicationError {
  constructor(message, code = 'GENERIC_ERROR', exitCode = 1, context = {}) {
    super(message, code, 500, context);
    this.exitCode = exitCode;
  }
}

export class ConfigError extends ApplicationError {
  constructor(message, context = {}) {
    super(message, 'CONFIG_ERROR', 400, context);
  }
}

export class ValidationError extends ApplicationError {
  constructor(message, errors = [], context = {}) {
    super(message, 'VALIDATION_ERROR', 400, { ...context, errors });
    this.errors = errors;
  }
}

export class ApiError extends ApplicationError {
  constructor(message, context = {}) {
    const statusCode = context.status || context.statusCode || 500;
    super(message, 'API_ERROR', statusCode, context);
  }
}

export class FileError extends ApplicationError {
  constructor(message, path, operation, context = {}) {
    super(message, 'FILE_ERROR', 500, { path, operation, ...context });
    this.path = path;
    this.operation = operation;
  }
}

export class AuthError extends ApplicationError {
  constructor(message, context = {}) {
    super(message, 'AUTH_ERROR', 401, context);
  }
}

const ANSI_COLORS = {
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  gray: '\x1b[90m',
  reset: '\x1b[0m'
};

function colorize(text, color) {
  if (!process.stdout.isTTY) return text;
  return `${ANSI_COLORS[color]}${text}${ANSI_COLORS.reset}`;
}

export function handleError(error, { spinner = null, verbose = false } = {}) {
  if (spinner) {
    spinner.fail(error.message);
  }

  console.error(colorize(`\n❌ Error: ${error.message}`, 'red'));

  if (error.context && Object.keys(error.context).length > 0) {
    console.error(colorize('\nError context:', 'yellow'));
    console.error(colorize(JSON.stringify(error.context, null, 2), 'gray'));
  }

  if (verbose && error.stack) {
    console.error(colorize('\nStack trace:', 'yellow'));
    console.error(colorize(error.stack, 'gray'));
  }

  if (error instanceof ValidationError && error.errors.length > 0) {
    console.error(colorize('\nValidation errors:', 'yellow'));
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

export function wrapError(error, message, context = {}) {
  if (error instanceof ApplicationError) {
    error.context = { ...error.context, ...context };
    return error;
  }

  return new ApplicationError(
    `${message}: ${error.message}`,
    'WRAPPED_ERROR',
    500,
    { originalError: error.toString(), ...context }
  );
}

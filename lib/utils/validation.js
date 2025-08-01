import { ValidationError } from './errors.js';

export function validateRequired(obj, requiredFields, objectName = 'Object') {
  const missing = requiredFields.filter(field => !obj[field]);

  if (missing.length > 0) {
    throw new ValidationError(
      `${objectName} is missing required fields: ${missing.join(', ')}`,
      missing.map(field => `Missing required field: ${field}`)
    );
  }
}

export function validateType(value, expectedType, fieldName) {
  const actualType = Array.isArray(value) ? 'array' : typeof value;

  if (actualType !== expectedType) {
    throw new ValidationError(
      `Invalid type for ${fieldName}: expected ${expectedType}, got ${actualType}`
    );
  }
}

export function validateEnum(value, allowedValues, fieldName) {
  if (!allowedValues.includes(value)) {
    throw new ValidationError(
      `Invalid value for ${fieldName}: must be one of ${allowedValues.join(', ')}`
    );
  }
}

export function validateRange(value, { min, max }, fieldName) {
  if (min !== undefined && value < min) {
    throw new ValidationError(`${fieldName} must be at least ${min}`);
  }

  if (max !== undefined && value > max) {
    throw new ValidationError(`${fieldName} must be at most ${max}`);
  }
}

export function validateString(value, { minLength, maxLength, pattern } = {}, fieldName) {
  if (typeof value !== 'string') {
    throw new ValidationError(`${fieldName} must be a string`);
  }

  if (minLength !== undefined && value.length < minLength) {
    throw new ValidationError(`${fieldName} must be at least ${minLength} characters`);
  }

  if (maxLength !== undefined && value.length > maxLength) {
    throw new ValidationError(`${fieldName} must be at most ${maxLength} characters`);
  }

  if (pattern && !pattern.test(value)) {
    throw new ValidationError(`${fieldName} has invalid format`);
  }
}

export function validateArray(value, { minItems, maxItems, itemValidator } = {}, fieldName) {
  if (!Array.isArray(value)) {
    throw new ValidationError(`${fieldName} must be an array`);
  }

  if (minItems !== undefined && value.length < minItems) {
    throw new ValidationError(`${fieldName} must have at least ${minItems} items`);
  }

  if (maxItems !== undefined && value.length > maxItems) {
    throw new ValidationError(`${fieldName} must have at most ${maxItems} items`);
  }

  if (itemValidator) {
    value.forEach((item, index) => {
      try {
        itemValidator(item);
      } catch (error) {
        throw new ValidationError(`${fieldName}[${index}]: ${error.message}`);
      }
    });
  }
}

export function validateObject(value, schema, fieldName = 'Object') {
  if (typeof value !== 'object' || value === null) {
    throw new ValidationError(`${fieldName} must be an object`);
  }

  const errors = [];

  for (const [key, validator] of Object.entries(schema)) {
    try {
      validator(value[key], key);
    } catch (error) {
      errors.push(error.message);
    }
  }

  if (errors.length > 0) {
    throw new ValidationError(`${fieldName} validation failed`, errors);
  }
}

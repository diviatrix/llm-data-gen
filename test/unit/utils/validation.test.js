import { describe, it, expect } from 'vitest';
import {
  validateRequired,
  validateType,
  validateEnum,
  validateRange,
  validateString,
  validateArray,
  validateObject
} from '../../../lib/utils/validation.js';
import { ValidationError } from '../../../lib/utils/errors.js';

describe('validation utilities', () => {
  describe('validateRequired', () => {
    it('should pass when all required fields are present', () => {
      const obj = { name: 'test', age: 25, email: 'test@example.com' };
      expect(() => validateRequired(obj, ['name', 'age'])).not.toThrow();
    });

    it('should throw when required fields are missing', () => {
      const obj = { name: 'test' };
      expect(() => validateRequired(obj, ['name', 'age', 'email']))
        .toThrow(ValidationError);
      expect(() => validateRequired(obj, ['name', 'age', 'email']))
        .toThrow('Object is missing required fields: age, email');
    });

    it('should use custom object name in error', () => {
      const obj = {};
      expect(() => validateRequired(obj, ['id'], 'User'))
        .toThrow('User is missing required fields: id');
    });
  });

  describe('validateType', () => {
    it('should pass for correct types', () => {
      expect(() => validateType('hello', 'string', 'name')).not.toThrow();
      expect(() => validateType(123, 'number', 'age')).not.toThrow();
      expect(() => validateType(true, 'boolean', 'active')).not.toThrow();
      expect(() => validateType({}, 'object', 'data')).not.toThrow();
      expect(() => validateType([], 'array', 'items')).not.toThrow();
    });

    it('should throw for incorrect types', () => {
      expect(() => validateType(123, 'string', 'name'))
        .toThrow('Invalid type for name: expected string, got number');
      expect(() => validateType('123', 'number', 'age'))
        .toThrow('Invalid type for age: expected number, got string');
    });

    it('should handle array type correctly', () => {
      expect(() => validateType([], 'array', 'items')).not.toThrow();
      expect(() => validateType({}, 'array', 'items'))
        .toThrow('Invalid type for items: expected array, got object');
    });
  });

  describe('validateEnum', () => {
    it('should pass for valid enum values', () => {
      const colors = ['red', 'green', 'blue'];
      expect(() => validateEnum('red', colors, 'color')).not.toThrow();
      expect(() => validateEnum('blue', colors, 'color')).not.toThrow();
    });

    it('should throw for invalid enum values', () => {
      const colors = ['red', 'green', 'blue'];
      expect(() => validateEnum('yellow', colors, 'color'))
        .toThrow('Invalid value for color: must be one of red, green, blue');
    });
  });

  describe('validateRange', () => {
    it('should pass for values within range', () => {
      expect(() => validateRange(5, { min: 1, max: 10 }, 'score')).not.toThrow();
      expect(() => validateRange(1, { min: 1 }, 'score')).not.toThrow();
      expect(() => validateRange(10, { max: 10 }, 'score')).not.toThrow();
    });

    it('should throw for values below minimum', () => {
      expect(() => validateRange(0, { min: 1 }, 'score'))
        .toThrow('score must be at least 1');
    });

    it('should throw for values above maximum', () => {
      expect(() => validateRange(11, { max: 10 }, 'score'))
        .toThrow('score must be at most 10');
    });
  });

  describe('validateString', () => {
    it('should pass for valid strings', () => {
      expect(() => validateString('hello', {}, 'name')).not.toThrow();
      expect(() => validateString('test', { minLength: 2, maxLength: 10 }, 'name')).not.toThrow();
    });

    it('should throw for non-string values', () => {
      expect(() => validateString(123, {}, 'name'))
        .toThrow('name must be a string');
    });

    it('should validate minimum length', () => {
      expect(() => validateString('hi', { minLength: 3 }, 'name'))
        .toThrow('name must be at least 3 characters');
    });

    it('should validate maximum length', () => {
      expect(() => validateString('toolong', { maxLength: 5 }, 'name'))
        .toThrow('name must be at most 5 characters');
    });

    it('should validate pattern', () => {
      const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      expect(() => validateString('test@example.com', { pattern: emailPattern }, 'email'))
        .not.toThrow();
      expect(() => validateString('invalid-email', { pattern: emailPattern }, 'email'))
        .toThrow('email has invalid format');
    });
  });

  describe('validateArray', () => {
    it('should pass for valid arrays', () => {
      expect(() => validateArray([1, 2, 3], {}, 'items')).not.toThrow();
      expect(() => validateArray(['a', 'b'], { minItems: 2, maxItems: 5 }, 'items')).not.toThrow();
    });

    it('should throw for non-array values', () => {
      expect(() => validateArray('not array', {}, 'items'))
        .toThrow('items must be an array');
    });

    it('should validate minimum items', () => {
      expect(() => validateArray([1], { minItems: 2 }, 'items'))
        .toThrow('items must have at least 2 items');
    });

    it('should validate maximum items', () => {
      expect(() => validateArray([1, 2, 3], { maxItems: 2 }, 'items'))
        .toThrow('items must have at most 2 items');
    });

    it('should validate array items with itemValidator', () => {
      const numberValidator = (value) => {
        if (typeof value !== 'number') throw new Error('Must be a number');
      };

      expect(() => validateArray([1, 2, 3], { itemValidator: numberValidator }, 'numbers'))
        .not.toThrow();
      expect(() => validateArray([1, 'two', 3], { itemValidator: numberValidator }, 'numbers'))
        .toThrow('numbers[1]: Must be a number');
    });
  });

  describe('validateObject', () => {
    it('should pass for valid objects', () => {
      const obj = { name: 'John', age: 25 };
      const schema = {
        name: (value) => validateString(value, {}, 'name'),
        age: (value) => validateRange(value, { min: 0, max: 150 }, 'age')
      };

      expect(() => validateObject(obj, schema)).not.toThrow();
    });

    it('should throw for non-object values', () => {
      expect(() => validateObject('not object', {}))
        .toThrow('Object must be an object');
      expect(() => validateObject(null, {}))
        .toThrow('Object must be an object');
    });

    it('should collect all validation errors', () => {
      const obj = { name: 123, age: 200 };
      const schema = {
        name: (value) => validateString(value, {}, 'name'),
        age: (value) => validateRange(value, { min: 0, max: 150 }, 'age')
      };

      expect(() => validateObject(obj, schema, 'Person'))
        .toThrow(ValidationError);

      try {
        validateObject(obj, schema, 'Person');
      } catch (error) {
        expect(error.errors).toHaveLength(2);
        expect(error.errors[0]).toContain('name must be a string');
        expect(error.errors[1]).toContain('age must be at most 150');
      }
    });
  });
});

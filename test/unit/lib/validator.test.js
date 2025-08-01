import { describe, it, expect, beforeEach } from 'vitest';
import { Validator } from '../../../lib/validator.js';

describe('Validator', () => {
  describe('basic object validation', () => {
    let validator;

    beforeEach(() => {
      const schema = {
        type: 'object',
        properties: {
          name: { type: 'string' },
          age: { type: 'number', minimum: 0, maximum: 150 },
          email: { type: 'string', format: 'email' }
        },
        required: ['name', 'age']
      };
      validator = new Validator(schema);
    });

    it('should validate valid object', () => {
      const data = {
        name: 'John Doe',
        age: 30,
        email: 'john@example.com'
      };

      const result = validator.validate(data);

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should report missing required fields', () => {
      const data = {
        name: 'John Doe'
      };

      const result = validator.validate(data);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('missing required property \'age\''))).toBe(true);
    });

    it('should validate type constraints', () => {
      const data = {
        name: 123,
        age: 30
      };

      const result = validator.validate(data);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('should be string'))).toBe(true);
    });

    it('should validate numeric constraints', () => {
      const data = {
        name: 'John',
        age: 200
      };

      const result = validator.validate(data);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('should be <= 150'))).toBe(true);
    });

    it('should validate email format', () => {
      const data = {
        name: 'John',
        age: 30,
        email: 'invalid-email'
      };

      const result = validator.validate(data);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('must match format "email"'))).toBe(true);
    });
  });

  describe('array validation', () => {
    let validator;

    beforeEach(() => {
      const schema = {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'number' },
            name: { type: 'string' }
          },
          required: ['id']
        },
        minItems: 1,
        maxItems: 5
      };
      validator = new Validator(schema);
    });

    it('should validate valid array', () => {
      const data = [
        { id: 1, name: 'Item 1' },
        { id: 2, name: 'Item 2' }
      ];

      const result = validator.validate(data);

      expect(result.valid).toBe(true);
    });

    it('should validate array constraints', () => {
      const data = [];

      const result = validator.validate(data);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('should have at least 1 items'))).toBe(true);
    });

    it('should validate array item properties', () => {
      const data = [
        { id: 1, name: 'Item 1' },
        { name: 'Item 2' }
      ];

      const result = validator.validate(data);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('missing required property \'id\''))).toBe(true);
    });
  });

  describe('nested object validation', () => {
    let validator;

    beforeEach(() => {
      const schema = {
        type: 'object',
        properties: {
          user: {
            type: 'object',
            properties: {
              profile: {
                type: 'object',
                properties: {
                  firstName: { type: 'string' },
                  lastName: { type: 'string' }
                },
                required: ['firstName']
              }
            },
            required: ['profile']
          }
        },
        required: ['user']
      };
      validator = new Validator(schema);
    });

    it('should validate deeply nested objects', () => {
      const data = {
        user: {
          profile: {
            firstName: 'John',
            lastName: 'Doe'
          }
        }
      };

      const result = validator.validate(data);

      expect(result.valid).toBe(true);
    });

    it('should report errors in nested objects', () => {
      const data = {
        user: {
          profile: {
            lastName: 'Doe'
          }
        }
      };

      const result = validator.validate(data);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('missing required property \'firstName\''))).toBe(true);
    });
  });

  describe('custom formats and patterns', () => {
    let validator;

    beforeEach(() => {
      const schema = {
        type: 'object',
        properties: {
          uuid: { type: 'string', format: 'uuid' },
          url: { type: 'string', format: 'uri' },
          date: { type: 'string', format: 'date' },
          time: { type: 'string', format: 'time' },
          dateTime: { type: 'string', format: 'date-time' },
          customPattern: {
            type: 'string',
            pattern: '^[A-Z]{2}\\d{3}$'
          }
        }
      };
      validator = new Validator(schema);
    });

    it('should validate various formats', () => {
      const data = {
        uuid: '123e4567-e89b-12d3-a456-426614174000',
        url: 'https://example.com',
        date: '2023-12-25',
        time: '14:30:00Z',
        dateTime: '2023-12-25T14:30:00Z',
        customPattern: 'AB123'
      };

      const result = validator.validate(data);

      expect(result.valid).toBe(true);
    });

    it('should reject invalid formats', () => {
      const data = {
        uuid: 'not-a-uuid',
        url: 'not a url',
        date: '25-12-2023',
        customPattern: 'abc123'
      };

      const result = validator.validate(data);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  describe('enum validation', () => {
    let validator;

    beforeEach(() => {
      const schema = {
        type: 'object',
        properties: {
          status: {
            type: 'string',
            enum: ['active', 'inactive', 'pending']
          },
          priority: {
            type: 'number',
            enum: [1, 2, 3]
          }
        }
      };
      validator = new Validator(schema);
    });

    it('should validate enum values', () => {
      const data = {
        status: 'active',
        priority: 2
      };

      const result = validator.validate(data);

      expect(result.valid).toBe(true);
    });

    it('should reject non-enum values', () => {
      const data = {
        status: 'unknown',
        priority: 5
      };

      const result = validator.validate(data);

      expect(result.valid).toBe(false);
      expect(result.errors.some(e => e.includes('should be one of'))).toBe(true);
    });
  });

  describe('validateExisting', () => {
    let validator;

    beforeEach(() => {
      const schema = {
        type: 'object',
        properties: {
          id: { type: 'number' },
          name: { type: 'string' }
        },
        required: ['id', 'name']
      };
      validator = new Validator(schema);
    });

    it('should validate array of objects', async () => {
      const data = [
        { id: 1, name: 'Item 1' },
        { id: 2, name: 'Item 2' },
        { id: 3 },
        { id: 'invalid', name: 'Item 4' }
      ];

      const results = await validator.validateExisting(data);

      expect(results).toHaveLength(4);
      expect(results[0].valid).toBe(true);
      expect(results[1].valid).toBe(true);
      expect(results[2].valid).toBe(false);
      expect(results[3].valid).toBe(false);
    });

    it('should validate single object wrapped in array', async () => {
      const data = { id: 1, name: 'Single Item' };

      const results = await validator.validateExisting(data);

      expect(results).toHaveLength(1);
      expect(results[0].valid).toBe(true);
      expect(results[0].item).toEqual(data);
    });
  });
});

import Ajv from 'ajv';

export class Validator {
  constructor(schema) {
    this.schema = schema;
    this.ajv = new Ajv({ 
      allErrors: true, 
      verbose: true,
      strict: false,
      allowUnionTypes: true
    });
    
    this.ajv.addKeyword({
      keyword: 'x-llm-generate',
      schemaType: 'object'
    });
    
    this.compiledSchema = this.ajv.compile(schema);
  }

  validate(data) {
    const valid = this.compiledSchema(data);
    
    if (!valid) {
      return {
        valid: false,
        errors: this._formatErrors(this.compiledSchema.errors)
      };
    }
    
    const customErrors = this._validateCustomRules(data);
    if (customErrors.length > 0) {
      return {
        valid: false,
        errors: customErrors
      };
    }
    
    return { valid: true, errors: [] };
  }

  validateBatch(items) {
    const results = {
      valid: [],
      invalid: [],
      summary: {
        total: items.length,
        valid: 0,
        invalid: 0
      }
    };
    
    items.forEach((item, index) => {
      const validation = this.validate(item);
      
      if (validation.valid) {
        results.valid.push({ index, item });
        results.summary.valid++;
      } else {
        results.invalid.push({ index, item, errors: validation.errors });
        results.summary.invalid++;
      }
    });
    
    return results;
  }

  _formatErrors(errors) {
    if (!errors) return [];
    
    return errors.map(err => {
      const path = err.instancePath || '/';
      const message = this._getErrorMessage(err);
      return `${path}: ${message}`;
    });
  }

  _getErrorMessage(error) {
    switch (error.keyword) {
      case 'type':
        return `should be ${error.schemaPath.includes('items') ? 'array of ' : ''}${error.params.type}`;
      case 'required':
        return `missing required property '${error.params.missingProperty}'`;
      case 'enum':
        return `should be one of: ${error.params.allowedValues.join(', ')}`;
      case 'minLength':
        return `should have minimum length of ${error.params.limit}`;
      case 'maxLength':
        return `should have maximum length of ${error.params.limit}`;
      case 'minimum':
        return `should be >= ${error.params.limit}`;
      case 'maximum':
        return `should be <= ${error.params.limit}`;
      case 'minItems':
        return `should have at least ${error.params.limit} items`;
      case 'maxItems':
        return `should have at most ${error.params.limit} items`;
      case 'pattern':
        return `should match pattern "${error.params.pattern}"`;
      case 'additionalProperties':
        return `has unknown property '${error.params.additionalProperty}'`;
      default:
        return error.message || 'validation failed';
    }
  }

  _validateCustomRules(data) {
    const errors = [];
    
    this._traverseData(data, '', (value, path, schema) => {
      if (schema?.['x-llm-generate']) {
        const genConfig = schema['x-llm-generate'];
        
        if (genConfig.minLength && typeof value === 'string' && value.length < genConfig.minLength) {
          errors.push(`${path}: custom rule - minimum length should be ${genConfig.minLength}`);
        }
        
        if (genConfig.maxLength && typeof value === 'string' && value.length > genConfig.maxLength) {
          errors.push(`${path}: custom rule - maximum length should be ${genConfig.maxLength}`);
        }
        
        if (genConfig.requirements && Array.isArray(genConfig.requirements)) {
          genConfig.requirements.forEach(req => {
            if (req.includes('НЕ содержать') && typeof value === 'string') {
              const pattern = req.match(/НЕ содержать (.+)/)?.[1];
              if (pattern && value.toLowerCase().includes(pattern.toLowerCase())) {
                errors.push(`${path}: should not contain "${pattern}"`);
              }
            }
          });
        }
      }
    });
    
    return errors;
  }

  _traverseData(data, path, callback, schema = this.schema) {
    if (Array.isArray(data)) {
      data.forEach((item, index) => {
        const itemPath = `${path}[${index}]`;
        const itemSchema = schema?.items || {};
        callback(item, itemPath, itemSchema);
        this._traverseData(item, itemPath, callback, itemSchema);
      });
    } else if (data && typeof data === 'object') {
      Object.entries(data).forEach(([key, value]) => {
        const propPath = path ? `${path}.${key}` : key;
        const propSchema = schema?.properties?.[key] || {};
        callback(value, propPath, propSchema);
        this._traverseData(value, propPath, callback, propSchema);
      });
    }
  }

  getSchemaInfo() {
    const info = {
      type: this.schema.type,
      properties: [],
      required: this.schema.required || []
    };
    
    if (this.schema.properties) {
      info.properties = Object.entries(this.schema.properties).map(([name, prop]) => ({
        name,
        type: prop.type,
        required: info.required.includes(name),
        description: prop.description || prop['x-llm-generate']?.description || ''
      }));
    }
    
    return info;
  }

  generateExample() {
    const example = {};
    
    const generate = (schema, target) => {
      if (schema.type === 'object' && schema.properties) {
        Object.entries(schema.properties).forEach(([key, prop]) => {
          target[key] = this._generateExampleValue(prop);
        });
      } else if (schema.type === 'array' && schema.items) {
        return [this._generateExampleValue(schema.items)];
      }
      
      return target;
    };
    
    return generate(this.schema, example);
  }

  _generateExampleValue(schema) {
    const genConfig = schema['x-llm-generate'];
    
    if (genConfig?.value) {
      return genConfig.value;
    }
    
    if (genConfig?.template) {
      return genConfig.template;
    }
    
    if (schema.enum) {
      return schema.enum[0];
    }
    
    switch (schema.type) {
      case 'string':
        return genConfig?.description || 'example string';
      case 'number':
      case 'integer':
        return schema.minimum || 0;
      case 'boolean':
        return true;
      case 'array':
        return schema.items ? [this._generateExampleValue(schema.items)] : [];
      case 'object':
        const obj = {};
        if (schema.properties) {
          Object.entries(schema.properties).forEach(([key, prop]) => {
            obj[key] = this._generateExampleValue(prop);
          });
        }
        return obj;
      default:
        return null;
    }
  }
}
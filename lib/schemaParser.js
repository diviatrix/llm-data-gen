export class SchemaParser {
  constructor(schema) {
    this.schema = schema;
    this.paths = [];
  }

  parse() {
    this.paths = [];
    this._traverseSchema(this.schema, []);
    return this.paths;
  }

  _traverseSchema(schema, path, parentSchema = null) {
    if (!schema || typeof schema !== 'object') return;

    if (schema.type === 'object' && schema.properties) {
      for (const [key, propSchema] of Object.entries(schema.properties)) {
        this._traverseSchema(propSchema, [...path, key], schema);
      }
    } else if (schema.type === 'array' && schema.items) {
      this._traverseSchema(schema.items, [...path, '[]'], schema);
    } else if (schema['x-llm-generate']) {
      this.paths.push({
        path: path.join('.'),
        schema: schema,
        parentSchema: parentSchema,
        generateConfig: schema['x-llm-generate'],
        type: schema.type,
        enum: schema.enum,
        format: schema.format,
        constraints: this._extractConstraints(schema)
      });
    } else if (schema.type) {
      this.paths.push({
        path: path.join('.'),
        schema: schema,
        parentSchema: parentSchema,
        generateConfig: null,
        type: schema.type,
        enum: schema.enum,
        format: schema.format,
        constraints: this._extractConstraints(schema)
      });
    }

    if (schema.oneOf) {
      schema.oneOf.forEach((subSchema, index) => {
        this._traverseSchema(subSchema, [...path, `oneOf[${index}]`], schema);
      });
    }

    if (schema.anyOf) {
      schema.anyOf.forEach((subSchema, index) => {
        this._traverseSchema(subSchema, [...path, `anyOf[${index}]`], schema);
      });
    }

    if (schema.allOf) {
      schema.allOf.forEach((subSchema, index) => {
        this._traverseSchema(subSchema, [...path, `allOf[${index}]`], schema);
      });
    }
  }

  _extractConstraints(schema) {
    const constraints = {};

    const constraintKeys = [
      'minimum', 'maximum', 'exclusiveMinimum', 'exclusiveMaximum',
      'minLength', 'maxLength', 'pattern', 'minItems', 'maxItems',
      'uniqueItems', 'minProperties', 'maxProperties', 'required',
      'const', 'multipleOf'
    ];

    constraintKeys.forEach(key => {
      if (schema[key] !== undefined) {
        constraints[key] = schema[key];
      }
    });

    return constraints;
  }

  findFieldsByPath(pathPattern) {
    const regex = new RegExp(pathPattern.replace(/\*/g, '.*'));
    return this.paths.filter(field => regex.test(field.path));
  }

  getFieldByPath(path) {
    return this.paths.find(field => field.path === path);
  }

  getGeneratableFields() {
    return this.paths.filter(field => field.generateConfig !== null);
  }

  getFieldsOfType(type) {
    return this.paths.filter(field => field.type === type);
  }

  resolveReferences(schema) {
    if (!schema.$ref) return schema;

    const refPath = schema.$ref.replace(/^#\//, '').split('/');
    let resolved = this.schema;

    for (const part of refPath) {
      resolved = resolved[part];
      if (!resolved) {
        throw new Error(`Cannot resolve reference: ${schema.$ref}`);
      }
    }

    return { ...resolved, ...schema };
  }
}

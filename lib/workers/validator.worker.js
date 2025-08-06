import { parentPort } from 'node:worker_threads';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';

let ajv;

parentPort.on('message', ({ type, data }) => {
  try {
    switch (type) {
    case 'init':
      ajv = new Ajv({
        allErrors: true,
        verbose: true,
        strict: false,
        removeAdditional: true,
        useDefaults: true,
        coerceTypes: true
      });
      addFormats(ajv);

      parentPort.postMessage({
        type: 'init-complete',
        success: true
      });
      break;

    case 'compile': {
      if (!ajv) {
        throw new Error('Validator not initialized');
      }

      const validate = ajv.compile(data.schema);

      parentPort.postMessage({
        type: 'compile-complete',
        id: data.id,
        success: true
      });
      break;
    }

    case 'validate': {
      if (!ajv) {
        throw new Error('Validator not initialized');
      }

      const validator = ajv.compile(data.schema);
      const isValid = validator(data.item);

      parentPort.postMessage({
        type: 'validate-complete',
        id: data.id,
        valid: isValid,
        errors: validator.errors ? validator.errors.map(error => ({
          instancePath: error.instancePath,
          schemaPath: error.schemaPath,
          keyword: error.keyword,
          params: error.params,
          message: error.message
        })) : []
      });
      break;
    }

    case 'validate-batch': {
      if (!ajv) {
        throw new Error('Validator not initialized');
      }

      const batchValidator = ajv.compile(data.schema);
      const results = data.items.map((item, index) => {
        const valid = batchValidator(item);
        return {
          index,
          valid,
          errors: valid ? [] : batchValidator.errors?.map(error => ({
            instancePath: error.instancePath,
            schemaPath: error.schemaPath,
            keyword: error.keyword,
            params: error.params,
            message: error.message
          })) || []
        };
      });

      parentPort.postMessage({
        type: 'validate-batch-complete',
        id: data.id,
        results
      });
      break;
    }

    default:
      throw new Error(`Unknown message type: ${type}`);
    }
  } catch (error) {
    parentPort.postMessage({
      type: 'error',
      id: data?.id,
      error: {
        message: error.message,
        stack: error.stack
      }
    });
  }
});

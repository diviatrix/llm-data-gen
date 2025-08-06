import { Transform } from 'node:stream';
import { DiagnosticsTracker } from '../diagnostics.js';

export class DataGeneratorStream extends Transform {
  constructor(config, apiClient, options = {}) {
    super({
      objectMode: true,
      highWaterMark: options.batchSize || 5
    });

    this.config = config;
    this.apiClient = apiClient;
    this.generatedCount = 0;
    this.errors = [];
    this.batchSize = options.batchSize || 5;
    this.onProgress = options.onProgress;
  }

  async _transform(context, encoding, callback) {
    try {
      DiagnosticsTracker.trackGeneration('start', this.config, { context, streaming: true });

      const result = await this._generateItem(context);

      if (result) {
        this.generatedCount++;
        DiagnosticsTracker.trackGeneration('complete', this.config, {
          streaming: true,
          totalGenerated: this.generatedCount
        });

        if (this.onProgress) {
          this.onProgress(this.generatedCount, context);
        }

        callback(null, result);
      } else {
        callback(null, null); // Skip failed items
      }
    } catch (error) {
      DiagnosticsTracker.trackGeneration('error', this.config, {
        error: error.message,
        streaming: true
      });

      this.errors.push({ context, error: error.message });
      callback(null, null); // Continue processing
    }
  }

  async _generateItem(context) {
    const systemPrompt = this.config.prompts?.systemPrompt ||
      'Generate data according to the provided schema and context.';

    let userPrompt;
    if (this.config.outputFormat === 'text') {
      const template = this.config.prompts?.userPrompt ||
        `Generate content based on the following context: ${JSON.stringify(context)}`;
      userPrompt = this._resolveTemplate(template, context);
    } else {
      userPrompt = this._buildSchemaPrompt(context);
    }

    const result = await this.apiClient.generateJSON(systemPrompt, userPrompt, {
      format: this.config.outputFormat || 'json',
      verbose: false
    });

    return this._processResult(result, context);
  }

  _buildSchemaPrompt(context) {
    const schemaStr = JSON.stringify(this.config.schema, null, 2);
    const contextStr = Object.keys(context).length > 0 ?
      `\n\nContext: ${JSON.stringify(context)}` : '';

    return `Generate valid JSON data that matches this schema:\n${schemaStr}${contextStr}`;
  }

  _resolveTemplate(template, context) {
    return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      return context[key] !== undefined ? context[key] : match;
    });
  }

  _processResult(result, context) {
    if (this.config.outputFormat === 'text') {
      return result;
    }

    // Simple JSON processing - more complex logic can be added
    if (typeof result === 'string') {
      try {
        return JSON.parse(result);
      } catch {
        return { content: result, context };
      }
    }

    return result;
  }

  getStats() {
    return {
      generatedCount: this.generatedCount,
      errorCount: this.errors.length,
      errors: this.errors
    };
  }
}

export async function* generateDataStream(config, apiClient, contexts, options = {}) {
  const batchSize = options.batchSize || 5;
  const stream = new DataGeneratorStream(config, apiClient, options);

  // Process contexts in batches
  for (let i = 0; i < contexts.length; i += batchSize) {
    const batch = contexts.slice(i, i + batchSize);
    const promises = batch.map(context =>
      stream._generateItem(context).catch(error => ({ error: error.message, context }))
    );

    const results = await Promise.all(promises);

    for (const result of results) {
      if (result && !result.error) {
        yield result;
      }
    }

    // Rate limiting between batches
    if (options.delay && i + batchSize < contexts.length) {
      await new Promise(resolve => setTimeout(resolve, options.delay));
    }
  }
}

export class ValidationStream extends Transform {
  constructor(validator, options = {}) {
    super({
      objectMode: true,
      highWaterMark: options.highWaterMark || 16
    });

    this.validator = validator;
    this.validCount = 0;
    this.invalidCount = 0;
    this.errors = [];
  }

  _transform(data, encoding, callback) {
    try {
      DiagnosticsTracker.trackValidation('start', this.validator.schema);

      const validation = this.validator.validate(data);

      DiagnosticsTracker.trackValidation('complete', this.validator.schema, {
        valid: validation.valid,
        streaming: true
      });

      if (validation.valid) {
        this.validCount++;
        callback(null, data);
      } else {
        this.invalidCount++;
        this.errors.push({
          data,
          errors: validation.errors
        });

        // Optionally pass through invalid data with error flag
        callback(null, {
          ...data,
          _validation: { valid: false, errors: validation.errors }
        });
      }
    } catch (error) {
      this.invalidCount++;
      this.errors.push({ data, error: error.message });
      callback(error);
    }
  }

  getStats() {
    return {
      validCount: this.validCount,
      invalidCount: this.invalidCount,
      totalProcessed: this.validCount + this.invalidCount,
      errors: this.errors
    };
  }
}

export async function createProcessingPipeline(config, apiClient, contexts, options = {}) {
  const dataStream = new DataGeneratorStream(config, apiClient, options);
  const results = [];

  try {
    for (const context of contexts) {
      dataStream.write(context);
    }

    dataStream.end();

    for await (const result of dataStream) {
      if (result) {
        results.push(result);
      }
    }

    return {
      results,
      stats: dataStream.getStats()
    };
  } catch (error) {
    throw new Error(`Pipeline failed: ${error.message}`);
  }
}

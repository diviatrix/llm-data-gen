import { channel } from 'node:diagnostics_channel';
import { performance } from 'node:perf_hooks';

const channels = {
  api: {
    request: channel('llmdatagen:api:request'),
    response: channel('llmdatagen:api:response'),
    error: channel('llmdatagen:api:error')
  },
  generation: {
    start: channel('llmdatagen:generation:start'),
    complete: channel('llmdatagen:generation:complete'),
    error: channel('llmdatagen:generation:error')
  },
  validation: {
    start: channel('llmdatagen:validation:start'),
    complete: channel('llmdatagen:validation:complete'),
    error: channel('llmdatagen:validation:error')
  },
  auth: {
    login: channel('llmdatagen:auth:login'),
    logout: channel('llmdatagen:auth:logout'),
    tokenValidation: channel('llmdatagen:auth:token:validation')
  },
  file: {
    read: channel('llmdatagen:file:read'),
    write: channel('llmdatagen:file:write'),
    delete: channel('llmdatagen:file:delete')
  }
};

export class DiagnosticsTracker {
  static trackApiRequest(model, endpoint, options = {}) {
    if (channels.api.request.hasSubscribers) {
      channels.api.request.publish({
        model,
        endpoint,
        options,
        timestamp: Date.now(),
        pid: process.pid
      });
    }
  }

  static trackApiResponse(model, endpoint, statusCode, duration, tokens = null) {
    if (channels.api.response.hasSubscribers) {
      channels.api.response.publish({
        model,
        endpoint,
        statusCode,
        duration,
        tokens,
        timestamp: Date.now(),
        pid: process.pid
      });
    }
  }

  static trackApiError(model, endpoint, error, duration) {
    if (channels.api.error.hasSubscribers) {
      channels.api.error.publish({
        model,
        endpoint,
        error: {
          message: error.message,
          code: error.code,
          statusCode: error.statusCode
        },
        duration,
        timestamp: Date.now(),
        pid: process.pid
      });
    }
  }

  static trackGeneration(event, config, data = {}) {
    const targetChannel = channels.generation[event];

    if (targetChannel && targetChannel.hasSubscribers) {
      targetChannel.publish({
        config: {
          model: config.model,
          temperature: config.temperature,
          format: config.outputFormat,
          count: config.count
        },
        ...data,
        timestamp: Date.now(),
        pid: process.pid
      });
    }
  }

  static trackValidation(event, schema, data = {}) {
    const targetChannel = channels.validation[event];

    if (targetChannel && targetChannel.hasSubscribers) {
      targetChannel.publish({
        schemaType: schema?.type || 'unknown',
        schemaProperties: schema?.properties ? Object.keys(schema.properties) : [],
        ...data,
        timestamp: Date.now(),
        pid: process.pid
      });
    }
  }

  static trackAuth(event, userId, data = {}) {
    const targetChannel = channels.auth[event];

    if (targetChannel && targetChannel.hasSubscribers) {
      targetChannel.publish({
        userId,
        ...data,
        timestamp: Date.now(),
        pid: process.pid
      });
    }
  }

  static trackFile(operation, path, data = {}) {
    const targetChannel = channels.file[operation];

    if (targetChannel && targetChannel.hasSubscribers) {
      targetChannel.publish({
        path,
        operation,
        ...data,
        timestamp: Date.now(),
        pid: process.pid
      });
    }
  }
}

export class PerformanceTracker {
  constructor(name) {
    this.name = name;
    this.marks = new Map();
  }

  start(label) {
    const markName = `${this.name}:${label}`;
    performance.mark(`${markName}:start`);
    this.marks.set(label, performance.now());
  }

  end(label) {
    const markName = `${this.name}:${label}`;
    const startTime = this.marks.get(label);

    if (!startTime) {
      console.warn(`No start mark found for ${label}`);
      return null;
    }

    performance.mark(`${markName}:end`);
    const duration = performance.now() - startTime;

    try {
      performance.measure(markName, `${markName}:start`, `${markName}:end`);
    } catch (e) {
      // Marks might not exist in some environments
    }

    this.marks.delete(label);
    return duration;
  }

  async measure(label, fn) {
    this.start(label);
    try {
      const result = await fn();
      const duration = this.end(label);
      return { result, duration };
    } catch (error) {
      const duration = this.end(label);
      error.measurementDuration = duration;
      throw error;
    }
  }
}

export function subscribeToAllChannels(callback) {
  const subscriptions = [];

  Object.values(channels).forEach(categoryChannels => {
    Object.values(categoryChannels).forEach(ch => {
      ch.subscribe(callback);
      subscriptions.push(() => ch.unsubscribe(callback));
    });
  });

  return () => subscriptions.forEach(unsub => unsub());
}

export function createMetricsCollector() {
  const metrics = {
    api: {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      totalDuration: 0,
      totalTokens: 0
    },
    generation: {
      totalGenerations: 0,
      successfulGenerations: 0,
      failedGenerations: 0,
      totalDuration: 0
    },
    validation: {
      totalValidations: 0,
      successfulValidations: 0,
      failedValidations: 0
    }
  };

  const unsubscribe = subscribeToAllChannels((channel, data) => {
    if (channel === channels.api.response) {
      metrics.api.totalRequests++;
      metrics.api.successfulRequests++;
      metrics.api.totalDuration += data.duration || 0;
      metrics.api.totalTokens += data.tokens || 0;
    } else if (channel === channels.api.error) {
      metrics.api.totalRequests++;
      metrics.api.failedRequests++;
      metrics.api.totalDuration += data.duration || 0;
    } else if (channel === channels.generation.complete) {
      metrics.generation.totalGenerations++;
      metrics.generation.successfulGenerations++;
      metrics.generation.totalDuration += data.duration || 0;
    } else if (channel === channels.generation.error) {
      metrics.generation.totalGenerations++;
      metrics.generation.failedGenerations++;
    } else if (channel === channels.validation.complete) {
      metrics.validation.totalValidations++;
      if (data.valid) {
        metrics.validation.successfulValidations++;
      } else {
        metrics.validation.failedValidations++;
      }
    }
  });

  return {
    metrics,
    unsubscribe,
    getReport() {
      return {
        api: {
          ...metrics.api,
          averageDuration: metrics.api.totalRequests > 0
            ? metrics.api.totalDuration / metrics.api.totalRequests
            : 0,
          averageTokens: metrics.api.successfulRequests > 0
            ? metrics.api.totalTokens / metrics.api.successfulRequests
            : 0
        },
        generation: {
          ...metrics.generation,
          averageDuration: metrics.generation.totalGenerations > 0
            ? metrics.generation.totalDuration / metrics.generation.totalGenerations
            : 0
        },
        validation: metrics.validation
      };
    }
  };
}

export { channels };

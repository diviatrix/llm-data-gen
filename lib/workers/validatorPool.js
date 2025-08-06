import { Worker } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';
import { EventEmitter } from 'node:events';
import { DiagnosticsTracker } from '../diagnostics.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class ValidatorPool extends EventEmitter {
  constructor(options = {}) {
    super();
    this.poolSize = options.poolSize || Math.min(4, Math.max(1, Math.floor(os.cpus().length / 2)));
    this.workers = [];
    this.availableWorkers = [];
    this.busyWorkers = new Set();
    this.pendingTasks = [];
    this.taskCounter = 0;
    this.initialized = false;
  }

  async init() {
    if (this.initialized) return;

    const workerPath = path.join(__dirname, 'validator.worker.js');
    const initPromises = [];

    for (let i = 0; i < this.poolSize; i++) {
      const worker = new Worker(workerPath);
      this.workers.push(worker);

      const initPromise = new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Worker initialization timeout'));
        }, 10000);

        worker.once('message', (message) => {
          if (message.type === 'init-complete') {
            clearTimeout(timeout);
            this.availableWorkers.push(worker);
            resolve();
          }
        });

        worker.once('error', (error) => {
          clearTimeout(timeout);
          reject(error);
        });
      });

      worker.postMessage({ type: 'init' });
      initPromises.push(initPromise);
    }

    await Promise.all(initPromises);
    this.initialized = true;
    this.emit('ready');
  }

  async validate(schema, item) {
    if (!this.initialized) {
      await this.init();
    }

    return new Promise((resolve, reject) => {
      const taskId = ++this.taskCounter;
      const task = {
        id: taskId,
        type: 'validate',
        schema,
        item,
        resolve,
        reject,
        startTime: performance.now()
      };

      DiagnosticsTracker.trackValidation('start', schema, { workerId: taskId });

      const worker = this.availableWorkers.pop();
      if (worker) {
        this._executeTask(worker, task);
      } else {
        this.pendingTasks.push(task);
      }
    });
  }

  async validateBatch(schema, items) {
    if (!this.initialized) {
      await this.init();
    }

    return new Promise((resolve, reject) => {
      const taskId = ++this.taskCounter;
      const task = {
        id: taskId,
        type: 'validate-batch',
        schema,
        items,
        resolve,
        reject,
        startTime: performance.now()
      };

      DiagnosticsTracker.trackValidation('start', schema, {
        workerId: taskId,
        batchSize: items.length
      });

      const worker = this.availableWorkers.pop();
      if (worker) {
        this._executeTask(worker, task);
      } else {
        this.pendingTasks.push(task);
      }
    });
  }

  _executeTask(worker, task) {
    this.busyWorkers.add(worker);

    const messageHandler = (message) => {
      if (message.type === 'validate-complete' && message.id === task.id) {
        worker.off('message', messageHandler);
        worker.off('error', errorHandler);

        const duration = performance.now() - task.startTime;
        DiagnosticsTracker.trackValidation('complete', task.schema, {
          workerId: task.id,
          duration,
          valid: message.valid
        });

        this._releaseWorker(worker);
        task.resolve({
          valid: message.valid,
          errors: message.errors
        });
      } else if (message.type === 'validate-batch-complete' && message.id === task.id) {
        worker.off('message', messageHandler);
        worker.off('error', errorHandler);

        const duration = performance.now() - task.startTime;
        DiagnosticsTracker.trackValidation('complete', task.schema, {
          workerId: task.id,
          duration,
          batchSize: message.results.length
        });

        this._releaseWorker(worker);
        task.resolve(message.results);
      } else if (message.type === 'error' && message.id === task.id) {
        worker.off('message', messageHandler);
        worker.off('error', errorHandler);

        const duration = performance.now() - task.startTime;
        DiagnosticsTracker.trackValidation('error', task.schema, {
          workerId: task.id,
          duration,
          error: message.error.message
        });

        this._releaseWorker(worker);
        task.reject(new Error(message.error.message));
      }
    };

    const errorHandler = (error) => {
      worker.off('message', messageHandler);
      worker.off('error', errorHandler);

      const duration = performance.now() - task.startTime;
      DiagnosticsTracker.trackValidation('error', task.schema, {
        workerId: task.id,
        duration,
        error: error.message
      });

      this._releaseWorker(worker);
      task.reject(error);
    };

    worker.on('message', messageHandler);
    worker.on('error', errorHandler);

    // Send the task to the worker
    worker.postMessage({
      type: task.type,
      data: {
        id: task.id,
        schema: task.schema,
        item: task.item,
        items: task.items
      }
    });
  }

  _releaseWorker(worker) {
    this.busyWorkers.delete(worker);

    // Process pending tasks
    if (this.pendingTasks.length > 0) {
      const nextTask = this.pendingTasks.shift();
      this._executeTask(worker, nextTask);
    } else {
      this.availableWorkers.push(worker);
    }
  }

  getStats() {
    return {
      poolSize: this.poolSize,
      availableWorkers: this.availableWorkers.length,
      busyWorkers: this.busyWorkers.size,
      pendingTasks: this.pendingTasks.length,
      totalWorkers: this.workers.length
    };
  }

  async destroy() {
    const terminatePromises = this.workers.map(worker => worker.terminate());
    await Promise.all(terminatePromises);

    this.workers = [];
    this.availableWorkers = [];
    this.busyWorkers.clear();
    this.pendingTasks = [];
    this.initialized = false;
  }
}

// Singleton instance
let globalPool = null;

export function getValidatorPool(options) {
  if (!globalPool) {
    globalPool = new ValidatorPool(options);
  }
  return globalPool;
}

export async function destroyValidatorPool() {
  if (globalPool) {
    await globalPool.destroy();
    globalPool = null;
  }
}

import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import cors from 'cors';
import multer from 'multer';
import os from 'node:os';
import { ConfigManager } from './lib/configManager.js';
import { DataGenerator } from './lib/generator.js';
import { readJsonFile } from './lib/utils/fileIO.js';
import { createApiClient } from './lib/sessionManager.js';
import { UserStorage } from './lib/userStorage.js';
import { authManager as authManagerPromise } from './lib/auth.js';
import { UserManager } from './lib/userManager.js';
import fs from 'node:fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
let authManager;

const app = express();
const PORT = process.env.PORT || 3000;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }
});

app.use(cors());
app.use(express.json({ limit: '10mb' }));

app.set('trust proxy', true);

app.use(express.static(path.join(__dirname, 'public')));

async function requireAuth(req, res, next) {
  if (req.originalUrl.startsWith('/api/auth/')) {
    return next();
  }

  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null;

  if (!token) {
    return res.status(401).json({ success: false, error: 'Authentication required' });
  }

  try {
    console.log('Validating token:', token);
    const session = await authManager.validateSession(token);
    console.log('Session validation result:', session);
    if (!session) {
      return res.status(401).json({ success: false, error: 'Invalid or expired session' });
    }

    req.user = session;

    try {
      if (session.userId) {
        const apiKey = await UserStorage.getUserApiKey(session.userId);
        if (apiKey) {
          req.userApiKey = apiKey;
          req.userHasApiKey = true;
        }
      }
    } catch (error) {
      console.error('Error checking user API key:', error);
    }

    next();
  } catch (error) {
    res.status(401).json({ success: false, error: 'Authentication failed' });
  }
}

app.use('/api/*', requireAuth);

function getUserId(req) {
  return req.user?.userId || 0;
}

const configManager = new ConfigManager();

// Auth endpoints
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Email and password are required'
      });
    }

    const result = await authManager.authenticate(email, password);
    res.json({ success: true, ...result });
  } catch (error) {
    res.status(401).json({
      success: false,
      error: error.message
    });
  }
});

app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Email and password are required'
      });
    }

    const result = await authManager.createUser(email, password);
    res.json({
      success: true,
      message: 'User registered successfully',
      userId: result.userId
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

app.post('/api/auth/logout', async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null;

    if (token) {
      await authManager.logout(token);
    }

    res.json({ success: true });
  } catch (error) {
    res.json({ success: true }); // Always return success for logout
  }
});

// API Key endpoints
app.get('/api/user/api-key', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Not authenticated' });
    }

    // Check if user has OpenRouter API key in their .env file
    const apiKey = await UserStorage.getUserApiKey(req.user.userId);
    const hasKey = !!apiKey;
    res.json({ success: true, hasKey });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to check API key' });
  }
});

// Get user storage info
app.get('/api/user/storage-info', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Not authenticated' });
    }

    const auth = await authManagerPromise;
    const storage = await auth.getStorageInfo(req.user.userId);

    res.json({
      success: true,
      storage
    });
  } catch (error) {
    console.error('Storage info error:', error);
    res.status(500).json({ success: false, error: 'Failed to get storage info' });
  }
});

app.post('/api/user/api-key', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Not authenticated' });
    }

    const { apiKey } = req.body;
    if (!apiKey || !apiKey.startsWith('sk-')) {
      return res.status(400).json({ success: false, error: 'Invalid API key format' });
    }

    // Save OpenRouter API key to user's .env file
    await UserStorage.ensureUserStructure(req.user.userId);
    const envPath = UserStorage.getUserApiKeyPath(req.user.userId);
    
    let envContent = '';
    try {
      envContent = await fs.readFile(envPath, 'utf-8');
    } catch {
      // File doesn't exist, will create new
    }

    const lines = envContent.split('\n');
    let keyFound = false;
    
    const updatedLines = lines.map(line => {
      if (line.startsWith('OPENROUTER_API_KEY=')) {
        keyFound = true;
        return `OPENROUTER_API_KEY=${apiKey}`;
      }
      return line;
    });

    if (!keyFound) {
      if (envContent && !envContent.endsWith('\n')) {
        updatedLines.push('');
      }
      updatedLines.push(`OPENROUTER_API_KEY=${apiKey}`);
    }

    await fs.writeFile(envPath, updatedLines.join('\n'));
    
    res.json({ success: true, message: 'API key saved successfully' });
  } catch (error) {
    console.error('Error saving API key:', error);
    res.status(500).json({ success: false, error: 'Failed to save API key' });
  }
});

app.delete('/api/user/api-key', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Not authenticated' });
    }

    // Delete OpenRouter API key from user's .env file
    const envPath = UserStorage.getUserApiKeyPath(req.user.userId);
    
    try {
      const envContent = await fs.readFile(envPath, 'utf-8');
      const lines = envContent.split('\n');
      const updatedLines = lines.filter(line => !line.startsWith('OPENROUTER_API_KEY='));
      await fs.writeFile(envPath, updatedLines.join('\n'));
    } catch {
      // File doesn't exist, nothing to delete
    }
    
    res.json({ success: true, message: 'API key deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to delete API key' });
  }
});

app.post('/api/auth/change-password', async (req, res) => {
  try {
    const { email, currentPassword, newPassword } = req.body;

    if (!email || !currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        error: 'All fields are required'
      });
    }

    // First authenticate with current password
    const user = await authManager.authenticate(email, currentPassword);

    // Update password
    await authManager.updatePassword(user.user.id, newPassword);

    res.json({ success: true, message: 'Password updated successfully' });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

// Helper to check if user has admin role
function isAdmin(req) {
  return req.user?.role === 'admin';
}

// Admin endpoints
app.get('/api/admin/users', async (req, res) => {
  if (!isAdmin(req)) {
    return res.status(403).json({ success: false, error: 'Admin access only' });
  }

  try {
    const users = await authManager.getAllUsers();
    res.json({ success: true, users });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/admin/users', async (req, res) => {
  if (!isAdmin(req)) {
    return res.status(403).json({ success: false, error: 'Admin access only' });
  }

  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Email and password are required'
      });
    }

    const result = await authManager.createUser(email, password);

    // Initialize user directories
    await UserStorage.ensureUserStructure(result.userId);

    res.json({ success: true, ...result });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

app.put('/api/admin/users/:id/toggle', async (req, res) => {
  if (!isAdmin(req)) {
    return res.status(403).json({ success: false, error: 'Admin access only' });
  }

  try {
    const userId = parseInt(req.params.id);
    await authManager.toggleUserActive(userId);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.delete('/api/admin/users/:id', async (req, res) => {
  if (!isAdmin(req)) {
    return res.status(403).json({ success: false, error: 'Admin access only' });
  }

  try {
    const userId = parseInt(req.params.id);

    // Clean up user data
    // TODO: Implement user data cleanup
    // await UserStorage.cleanupUserData(userId);

    // Delete user from database
    await authManager.deleteUser(userId);

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/admin/users/:id/reset-password', async (req, res) => {
  if (!isAdmin(req)) {
    return res.status(403).json({ success: false, error: 'Admin access only' });
  }

  try {
    const userId = parseInt(req.params.id);
    const { newPassword } = req.body;

    if (!newPassword) {
      return res.status(400).json({
        success: false,
        error: 'New password is required'
      });
    }

    await authManager.updatePassword(userId, newPassword);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Role management endpoints
app.get('/api/roles', async (req, res) => {
  if (!isAdmin(req)) {
    return res.status(403).json({ success: false, error: 'Admin access only' });
  }

  try {
    const roles = await authManager.getRoles();
    res.json({ success: true, roles });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.put('/api/admin/users/:id/role', async (req, res) => {
  if (!isAdmin(req)) {
    return res.status(403).json({ success: false, error: 'Admin access only' });
  }

  try {
    const userId = parseInt(req.params.id);
    const { roleId } = req.body;

    if (!roleId) {
      return res.status(400).json({ success: false, error: 'Role ID required' });
    }

    await authManager.updateUserRole(userId, roleId);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Update user details (quota and API key) - Admin only
app.put('/api/admin/users/:id/details', async (req, res) => {
  if (!isAdmin(req)) {
    return res.status(403).json({ success: false, error: 'Admin access only' });
  }

  try {
    console.log('Update user details request:', {
      userId: req.params.id,
      body: req.body
    });

    const auth = await authManagerPromise;
    const userId = parseInt(req.params.id);
    const { quotaMB, apiKey } = req.body;

    // Update storage quota if provided
    if (quotaMB !== undefined) {
      const quotaMBNumber = parseInt(quotaMB);
      if (isNaN(quotaMBNumber) || quotaMBNumber < 1) {
        return res.status(400).json({ success: false, error: 'Invalid quota value' });
      }
      const quotaBytes = quotaMBNumber * 1024 * 1024;
      console.log(`Updating user ${userId} quota to ${quotaMB}MB (${quotaBytes} bytes)`);

      const result = await auth.db.runAsync(
        'UPDATE users SET storage_quota = ? WHERE id = ?',
        [quotaBytes, userId]
      );

      console.log('Update result:', result);

      // Verify the update
      const updatedUser = await auth.getUserById(userId);
      console.log(`User ${userId} quota after update: ${updatedUser.storage_quota} bytes (${updatedUser.storage_quota / 1024 / 1024}MB)`);

      if (updatedUser.storage_quota !== quotaBytes) {
        console.error(`ERROR: Quota not updated! Expected ${quotaBytes}, got ${updatedUser.storage_quota}`);
      }
    }

    // Update API key if provided
    if (apiKey && apiKey.startsWith('sk-')) {
      // Get user's password hash to encrypt the key
      const user = await auth.getUserById(userId);
      if (!user) {
        return res.status(404).json({ success: false, error: 'User not found' });
      }

      // Save encrypted API key
      await auth.saveApiKey(userId, apiKey);

      // Also save to user's .env file
      const userApiKeyPath = UserStorage.getUserApiKeyPath(userId);
      await fs.writeFile(userApiKeyPath, `OPENROUTER_API_KEY=${apiKey}\n`);
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Update user details error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', version: '1.0.0' });
});

// Get account info
app.get('/api/account', async (req, res) => {
  try {
    // For cloud users, require API key
    if (req.user && !req.userHasApiKey) {
      return res.status(400).json({
        success: false,
        error: 'API key required',
        needsApiKey: true
      });
    }

    const client = await createApiClient({}, req);
    const userInfo = await client.getUserInfo();

    if (userInfo.success && userInfo.data?.data) {
      const data = userInfo.data.data;
      const limit = parseFloat(data.limit || 0);
      const usage = parseFloat(data.usage || 0);
      const remaining = parseFloat(data.limit_remaining || (limit - usage));
      const percentUsed = limit > 0 ? (usage / limit * 100).toFixed(1) : 0;

      res.json({
        success: true,
        account: {
          balance: remaining.toFixed(2),
          limit: limit.toFixed(2),
          usage: usage.toFixed(2),
          percentUsed: parseFloat(percentUsed),
          tier: data.tier || 'unknown'
        }
      });
    } else {
      res.json({ success: false, error: 'Failed to fetch account info' });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get available models
app.get('/api/models', async (req, res) => {
  try {
    const client = await createApiClient({}, req);
    const models = await client.getModels();

    res.json({
      success: true,
      models: models.map(m => {
        // Determine web search support
        const isPerplexity = m.id.toLowerCase().includes('perplexity');
        const hasNativeWebSearch = isPerplexity;
        const supportsWebSearch = true; // All models support web search via :online

        // Calculate web search pricing
        const webSearchPricing = {
          plugin: 0.02, // ~$0.02 per request for web plugin
          native: null
        };

        if (isPerplexity) {
          // Perplexity models have tiered pricing
          webSearchPricing.native = {
            low: 0.005,    // $5 per 1000 requests
            medium: 0.008, // $8 per 1000 requests
            high: 0.012    // $12 per 1000 requests
          };
        }

        return {
          id: m.id,
          name: m.name,
          canonical_slug: m.canonical_slug,
          description: m.description,
          context_length: m.context_length,
          pricing: m.pricing,
          top_provider: m.top_provider,
          architecture: m.architecture,
          created: m.created,
          per_request_limits: m.per_request_limits,
          supported_parameters: m.supported_parameters,
          hugging_face_id: m.hugging_face_id,
          // Additional computed fields for easier access
          max_completion_tokens: m.top_provider?.max_completion_tokens,
          is_moderated: m.top_provider?.is_moderated,
          input_modalities: m.architecture?.input_modalities || [],
          output_modalities: m.architecture?.output_modalities || [],
          tokenizer: m.architecture?.tokenizer,
          instruct_type: m.architecture?.instruct_type,
          // Web search support
          supports_web_search: supportsWebSearch,
          has_native_web_search: hasNativeWebSearch,
          web_search_pricing: webSearchPricing
        };
      })
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Validate configuration
app.post('/api/validate-config', async (req, res) => {
  try {
    const config = req.body;

    // Try to create DataGenerator to validate schema
    if (config.output?.format === 'json') {
      try {
        new DataGenerator(config, { req });
      } catch (error) {
        return res.json({
          success: false,
          error: error.message,
          details: error.code === 'SCHEMA_ERROR' ? 'Schema validation failed' : null
        });
      }
    }

    // Basic config validation
    const validation = configManager._validateConfig(config);

    res.json({
      success: true,
      message: 'Configuration is valid',
      config: validation
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message
    });
  }
});

// Generate data
app.post('/api/generate', async (req, res) => {
  try {
    const config = req.body;

    // Ensure output path is set
    config.output = config.output || {};
    if (!config.output.outputPath) {
      config.output.outputPath = './output/';
    }

    // For cloud users, check if they have an API key
    if (req.user) {
      if (!req.userHasApiKey) {
        return res.status(400).json({
          success: false,
          error: 'API key required. Please set your OpenRouter API key in settings.'
        });
      }
    }

    // Pass request context to DataGenerator for proper path resolution
    const generator = new DataGenerator(config, { req });
    const results = await generator.generateAll();

    res.json({
      success: true,
      results,
      stats: {
        totalGenerated: generator.generatedCount,
        totalCost: generator.totalCost,
        errors: generator.errors
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
      code: error.code
    });
  }
});

// Store active generation controllers
const activeGenerations = new Map();

// Generate data with streaming progress (Server-Sent Events)
app.post('/api/generate-stream', async (req, res) => {
  // Store original console methods
  const originalConsole = {
    log: console.log,
    info: console.info,
    debug: console.debug,
    warn: console.warn,
    error: console.error,
    success: console.success,
    section: console.section
  };

  const generationId = req.body.generationId || require('crypto').randomUUID();
  const abortController = new AbortController();

  try {
    // Get config from request body
    const { config, estimatedCost } = req.body;
    const userId = getUserId(req);

    // Store controller for cancellation
    activeGenerations.set(generationId, { abortController, userId });

    // Set SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });

    // Send initial event with generation ID
    res.write(`data: ${JSON.stringify({ type: 'start', generationId })}\n\n`);

    // Create active generation in database
    const auth = await authManagerPromise;
    const logs = [];
    await auth.createActiveGeneration({
      id: generationId,
      userId,
      configName: config.meta?.name || 'Unnamed',
      model: config.api?.model,
      estimatedCost,
      progressTotal: config.generation?.tasks?.reduce((sum, task) => sum + (task.count || 1), 0) || 0,
      logs
    });

    // For cloud users, check if they have an API key
    if (req.user) {
      if (!req.userHasApiKey) {
        res.write(`data: ${JSON.stringify({
          type: 'error',
          error: 'API key required. Please set your OpenRouter API key in settings.'
        })}\n\n`);
        res.end();
        return;
      }
    }

    // Create a custom logger that sends logs through SSE and saves to DB

    // Override console methods to capture logs
    const captureLog = async (level, args) => {
      // Call original console method
      if (originalConsole[level]) {
        originalConsole[level].apply(console, args);
      }

      // Send log through SSE
      const message = args.map(arg =>
        typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
      ).join(' ');

      const logEntry = {
        time: new Date().toISOString(),
        level,
        message
      };

      // Add to logs array
      logs.push(logEntry);

      // Update database with new logs
      try {
        await auth.updateActiveGeneration(generationId, { logs });
      } catch (error) {
        console.error('Failed to update logs:', error);
      }

      res.write(`data: ${JSON.stringify({
        type: 'log',
        level: level,
        message: message,
        timestamp: logEntry.time
      })}\n\n`);
    };

    // Temporarily override console methods
    const consoleOverrides = {
      log: (...args) => { captureLog('log', args).catch(console.error); },
      info: (...args) => { captureLog('info', args).catch(console.error); },
      debug: (...args) => { captureLog('debug', args).catch(console.error); },
      warn: (...args) => { captureLog('warn', args).catch(console.error); },
      error: (...args) => { captureLog('error', args).catch(console.error); },
      success: (...args) => { captureLog('success', args).catch(console.error); },
      section: (...args) => { captureLog('section', args).catch(console.error); }
    };

    Object.assign(console, consoleOverrides);

    // Add initial log entry
    const initialLog = {
      time: new Date().toISOString(),
      level: 'info',
      message: '🚀 Generation started'
    };
    logs.push(initialLog);
    await auth.updateActiveGeneration(generationId, { logs });

    // Create generator with progress callback and abort signal
    const generator = new DataGenerator(config, {
      req,
      estimatedCost,
      abortSignal: abortController.signal,
      onProgress: async (progress) => {
        // Check if cancelled
        if (abortController.signal.aborted) {
          throw new Error('Generation cancelled by user');
        }

        // Add progress log
        const progressLog = {
          time: new Date().toISOString(),
          level: 'info',
          message: `Generating item ${progress.current}/${progress.total}: ${progress.currentItem || 'Processing...'}`
        };
        logs.push(progressLog);

        // Update database
        await auth.updateActiveGeneration(generationId, {
          progressCurrent: progress.current,
          progressTotal: progress.total,
          logs
        });

        // Send progress updates
        res.write(`data: ${JSON.stringify({
          type: 'progress',
          progress: {
            current: progress.current,
            total: progress.total,
            percentage: Math.round((progress.current / progress.total) * 100),
            currentItem: progress.currentItem
          }
        })}\n\n`);
      }
    });

    try {
      const results = await generator.generateAll();

      // Add completion log
      const completionLog = {
        time: new Date().toISOString(),
        level: 'success',
        message: `✅ Generation completed! Generated ${generator.generatedCount} items`
      };
      logs.push(completionLog);
      await auth.updateActiveGeneration(generationId, { logs });

      // Send completion event
      res.write(`data: ${JSON.stringify({
        type: 'complete',
        results,
        stats: {
          totalGenerated: generator.generatedCount,
          totalCost: generator.totalCost,
          errors: generator.errors
        }
      })}\n\n`);
    } catch (error) {
      // Add error log
      const errorLog = {
        time: new Date().toISOString(),
        level: 'error',
        message: `❌ Error: ${error.message}`
      };
      logs.push(errorLog);
      await auth.updateActiveGeneration(generationId, { logs, status: 'failed' });

      // Send error event
      res.write(`data: ${JSON.stringify({
        type: 'error',
        error: error.message,
        code: error.code
      })}\n\n`);
    }

    res.end();

    // Restore original console methods
    Object.assign(console, originalConsole);

    // Clean up
    await auth.deleteActiveGeneration(generationId);
    activeGenerations.delete(generationId);
  } catch (error) {
    // Restore original console methods
    Object.assign(console, originalConsole);
    console.error('Generate stream error:', error);

    // Clean up on error
    const auth = await authManagerPromise;
    await auth.deleteActiveGeneration(generationId);
    activeGenerations.delete(generationId);

    res.status(500).end();
  }
});

// Upload and parse config file
app.post('/api/upload-config', upload.single('config'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }

    const content = req.file.buffer.toString('utf-8');
    const config = JSON.parse(content);

    res.json({
      success: true,
      config,
      filename: req.file.originalname
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: 'Invalid JSON file: ' + error.message
    });
  }
});

// Upload user file with quota check
app.post('/api/upload-file', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }

    const userId = getUserId(req);
    const auth = await authManagerPromise;

    // Check storage quota
    const fileSize = req.file.size;
    const canUpload = await auth.canUploadFile(userId, fileSize);

    if (!canUpload) {
      return res.status(400).json({
        success: false,
        error: 'Storage quota exceeded',
        storage: await auth.getStorageInfo(userId)
      });
    }

    // Save file to user's uploads directory
    const uploadsDir = UserStorage.getUserUploadsDir(userId);
    await fs.mkdir(uploadsDir, { recursive: true });

    // Generate safe filename
    const timestamp = Date.now();
    const safeFilename = `${timestamp}_${req.file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
    const filePath = path.join(uploadsDir, safeFilename);

    // Save file
    await fs.writeFile(filePath, req.file.buffer);

    // Update user's storage usage
    await auth.addStorageUsed(userId, fileSize);

    res.json({
      success: true,
      file: {
        name: req.file.originalname,
        savedAs: safeFilename,
        size: fileSize,
        type: req.file.mimetype,
        path: `uploads/${safeFilename}`
      },
      storage: await auth.getStorageInfo(userId)
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to upload file'
    });
  }
});

// Upload and parse result file
app.post('/api/upload-result', upload.single('result'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }

    const content = req.file.buffer.toString('utf-8');
    const result = JSON.parse(content);

    res.json({
      success: true,
      result,
      filename: req.file.originalname
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: 'Invalid JSON file: ' + error.message
    });
  }
});

// List files by type (configs, output, uploads)
app.get('/api/files/list', async (req, res) => {
  try {
    const userId = getUserId(req);
    const { type } = req.query;

    let dir;
    switch (type) {
    case 'configs':
      dir = UserStorage.getUserConfigsDir(userId);
      break;
    case 'output':
      dir = UserStorage.getUserOutputDir(userId);
      break;
    case 'uploads':
      dir = UserStorage.getUserUploadsDir(userId);
      break;
    default:
      return res.status(400).json({
        success: false,
        error: 'Invalid file type'
      });
    }

    // Ensure directory exists
    await fs.mkdir(dir, { recursive: true });

    // Read files from directory
    const files = await fs.readdir(dir);
    const fileList = [];

    for (const file of files) {
      const filePath = path.join(dir, file);
      const stats = await fs.stat(filePath);

      if (stats.isFile()) {
        // Get relative path from user base directory
        const userBaseDir = UserStorage.getUserBaseDir(userId);
        const relativePath = path.relative(userBaseDir, filePath);

        fileList.push({
          name: file,
          path: relativePath,
          size: stats.size,
          modified: stats.mtime
        });
      }
    }

    res.json({
      success: true,
      files: fileList
    });
  } catch (error) {
    console.error('List files error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to list files'
    });
  }
});

// List user uploaded files
app.get('/api/user-files', async (req, res) => {
  try {
    const userId = getUserId(req);
    const uploadsDir = UserStorage.getUserUploadsDir(userId);

    // Ensure directory exists
    await fs.mkdir(uploadsDir, { recursive: true });

    // Read files from uploads directory
    const files = await fs.readdir(uploadsDir);
    const fileList = [];

    for (const file of files) {
      const filePath = path.join(uploadsDir, file);
      const stats = await fs.stat(filePath);

      if (stats.isFile()) {
        // Get relative path from user base directory
        const userBaseDir = UserStorage.getUserBaseDir(userId);
        const relativePath = path.relative(userBaseDir, filePath);

        fileList.push({
          name: file,
          path: relativePath,
          size: stats.size,
          modified: stats.mtime
        });
      }
    }

    res.json({
      success: true,
      files: fileList
    });
  } catch (error) {
    console.error('List user files error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to list files'
    });
  }
});

// Generation history / Queue
app.get('/api/queue', async (req, res) => {
  try {
    const userId = getUserId(req);
    const auth = await authManagerPromise;

    // Get both active and completed generations
    const [active, completed] = await Promise.all([
      auth.getActiveGenerations(userId),
      auth.getGenerationHistory(userId, 50)
    ]);

    res.json({
      success: true,
      active,
      completed
    });
  } catch (error) {
    console.error('Failed to get generation history:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to load generation history'
    });
  }
});

// Cancel active generation
app.post('/api/generations/:id/cancel', async (req, res) => {
  try {
    const generationId = req.params.id;
    const userId = getUserId(req);

    // Find and abort the generation
    const generation = activeGenerations.get(generationId);
    if (!generation) {
      return res.status(404).json({
        success: false,
        error: 'Generation not found or already completed'
      });
    }

    // Check user owns this generation
    if (generation.userId !== userId && req.user?.role !== 'admin') {
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }

    // Abort the generation
    generation.abortController.abort();

    // Update database
    const auth = await authManagerPromise;
    await auth.updateActiveGeneration(generationId, { status: 'cancelled' });

    // Clean up
    setTimeout(async () => {
      await auth.deleteActiveGeneration(generationId);
      activeGenerations.delete(generationId);
    }, 1000);

    res.json({
      success: true,
      message: 'Generation cancelled'
    });
  } catch (error) {
    console.error('Failed to cancel generation:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to cancel generation'
    });
  }
});

// Delete generation from history
app.delete('/api/queue/:id', requireAuth, async (req, res) => {
  try {
    const generationId = parseInt(req.params.id);
    const userId = req.user.userId;

    // Delete the generation history entry
    const auth = await authManagerPromise;
    await auth.deleteGenerationHistory(userId, generationId);

    res.json({
      success: true,
      message: 'Generation deleted from history'
    });
  } catch (error) {
    console.error('Failed to delete generation:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete generation'
    });
  }
});

// Get example configurations
app.get('/api/examples', async (req, res) => {
  try {
    const examples = await configManager.listExamples();
    const configs = {};

    for (const example of examples) {
      try {
        configs[example] = await configManager.loadExample(example);
      } catch (e) {
        // Skip invalid examples
      }
    }

    res.json({
      success: true,
      examples: configs
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get user uploaded files
app.get('/api/user-files', async (req, res) => {
  try {
    const userId = getUserId(req);
    const uploadsDir = UserStorage.getUserUploadsDir(userId);

    // Ensure directory exists
    await fs.mkdir(uploadsDir, { recursive: true });

    // Get all files
    const files = await fs.readdir(uploadsDir);

    // Get file stats
    const fileStats = await Promise.all(
      files.map(async (file) => {
        const filePath = path.join(uploadsDir, file);
        const stats = await fs.stat(filePath);
        return {
          name: file,
          path: `uploads/${file}`,
          size: stats.size,
          modified: stats.mtime,
          type: path.extname(file).toLowerCase()
        };
      })
    );

    // Get storage info
    const auth = await authManagerPromise;
    const storageInfo = await auth.getStorageInfo(userId);

    res.json({
      success: true,
      files: fileStats.sort((a, b) => b.modified - a.modified),
      storage: storageInfo
    });
  } catch (error) {
    console.error('Failed to get user files:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to load user files'
    });
  }
});

// Get output directory files
app.get('/api/output-files', async (req, res) => {
  try {
    const { subpath = '' } = req.query;
    const userId = getUserId(req);
    const baseDir = UserStorage.getUserOutputDir(userId);
    const targetDir = subpath ? path.join(baseDir, subpath) : baseDir;

    // Security check - prevent directory traversal
    if (subpath && (subpath.includes('..') || path.isAbsolute(subpath))) {
      return res.status(400).json({
        success: false,
        error: 'Invalid path'
      });
    }

    // Ensure directory exists
    await fs.mkdir(targetDir, { recursive: true });

    // Get all files
    const files = await fs.readdir(targetDir);

    // Get file stats
    const fileStats = await Promise.all(
      files.map(async (file) => {
        const filePath = path.join(targetDir, file);
        const stats = await fs.stat(filePath);
        const isDirectory = stats.isDirectory();
        return {
          name: file,
          path: filePath,
          relativePath: subpath ? path.join(subpath, file) : file,
          size: stats.size,
          modified: stats.mtime,
          created: stats.birthtime,
          isJson: !isDirectory && file.endsWith('.json'),
          isDirectory: isDirectory,
          extension: isDirectory ? null : path.extname(file)
        };
      })
    );

    // Sort directories first, then by name
    fileStats.sort((a, b) => {
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;
      return a.name.localeCompare(b.name);
    });

    res.json({
      success: true,
      outputDir: baseDir,
      currentPath: subpath,
      files: fileStats
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Alias for result-files (фронтенд использует это название)
app.get('/api/result-files', async (req, res) => {
  // Используем тот же обработчик что и output-files
  req.url = '/api/output-files';
  req.query = req.query || {};
  app._router.handle(req, res);
});

// Get specific result file content
app.get('/api/result-file/*', async (req, res) => {
  try {
    const filename = req.params[0];
    const userId = getUserId(req);
    const baseDir = UserStorage.getUserOutputDir(userId);
    const filePath = path.join(baseDir, filename);

    // Security check - prevent directory traversal
    if (filename.includes('..') || path.isAbsolute(filename)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid filename'
      });
    }

    // Check if file exists and is within the output directory
    const resolvedPath = path.resolve(filePath);
    const resolvedBase = path.resolve(baseDir);
    if (!resolvedPath.startsWith(resolvedBase)) {
      return res.status(400).json({
        success: false,
        error: 'Access denied'
      });
    }

    // Check if it's a JSON file
    if (path.extname(filename) === '.json') {
      const content = await readJsonFile(filePath);
      res.json({
        success: true,
        filename: filename,
        content: content
      });
    } else {
      // For non-JSON files, read as text and send with proper content-type
      const content = await fs.readFile(filePath, 'utf-8');

      // Set appropriate content-type based on file extension
      const ext = path.extname(filename).toLowerCase();
      let contentType = 'text/plain';
      switch (ext) {
      case '.csv': contentType = 'text/csv'; break;
      case '.html': contentType = 'text/html'; break;
      case '.css': contentType = 'text/css'; break;
      case '.js': contentType = 'text/javascript'; break;
      case '.xml': contentType = 'text/xml'; break;
      case '.sql': contentType = 'text/plain'; break;
      case '.md': contentType = 'text/markdown'; break;
      }

      res.set('Content-Type', contentType);
      res.send(content);
    }
  } catch (error) {
    res.status(404).json({
      success: false,
      error: 'File not found'
    });
  }
});

// Delete result file
app.delete('/api/result-file/*', async (req, res) => {
  try {
    const filename = req.params[0];
    const userId = getUserId(req);
    const baseDir = UserStorage.getUserOutputDir(userId);
    const filePath = path.join(baseDir, filename);

    // Security check - prevent directory traversal
    if (filename.includes('..') || path.isAbsolute(filename)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid filename'
      });
    }

    // Check if file exists and is within the output directory
    const resolvedPath = path.resolve(filePath);
    const resolvedBase = path.resolve(baseDir);
    if (!resolvedPath.startsWith(resolvedBase)) {
      return res.status(400).json({
        success: false,
        error: 'Access denied'
      });
    }

    // Delete the file
    await fs.unlink(filePath);

    res.json({
      success: true,
      message: 'File deleted successfully'
    });
  } catch (error) {
    res.status(404).json({
      success: false,
      error: 'File not found or unable to delete'
    });
  }
});

// Get specific config file content
app.get('/api/config-file/:filename', async (req, res) => {
  try {
    const filename = req.params.filename;
    const userId = getUserId(req);
    const configsDir = UserStorage.getUserConfigsDir(userId);
    const filePath = path.join(configsDir, filename);

    // Security check
    if (filename.includes('..') || path.isAbsolute(filename)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid filename'
      });
    }

    // Check if file exists and is within the configs directory
    const resolvedPath = path.resolve(filePath);
    const resolvedBase = path.resolve(configsDir);
    if (!resolvedPath.startsWith(resolvedBase)) {
      return res.status(400).json({
        success: false,
        error: 'Access denied'
      });
    }

    const content = await readJsonFile(filePath);
    res.json({
      success: true,
      filename: filename,
      content: content
    });
  } catch (error) {
    res.status(404).json({
      success: false,
      error: 'Config file not found'
    });
  }
});

// Get user configs directory files
app.get('/api/config-files', async (req, res) => {
  try {
    const { subpath = '' } = req.query;
    const userId = getUserId(req);
    const baseDir = UserStorage.getUserConfigsDir(userId);
    const targetDir = subpath ? path.join(baseDir, subpath) : baseDir;

    // Security check - prevent directory traversal
    if (subpath && (subpath.includes('..') || path.isAbsolute(subpath))) {
      return res.status(400).json({
        success: false,
        error: 'Invalid path'
      });
    }

    // Ensure directory exists
    await fs.mkdir(targetDir, { recursive: true });

    // Get all files
    const files = await fs.readdir(targetDir);

    // Get file stats
    const fileStats = await Promise.all(
      files.map(async (file) => {
        const filePath = path.join(targetDir, file);
        const stats = await fs.stat(filePath);
        const isDirectory = stats.isDirectory();
        return {
          name: file,
          path: filePath,
          relativePath: subpath ? path.join(subpath, file) : file,
          size: stats.size,
          modified: stats.mtime,
          created: stats.birthtime,
          isJson: !isDirectory && file.endsWith('.json'),
          isDirectory: isDirectory,
          extension: isDirectory ? null : path.extname(file)
        };
      })
    );

    // Sort directories first, then by name
    fileStats.sort((a, b) => {
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;
      return a.name.localeCompare(b.name);
    });

    res.json({
      success: true,
      configsDir: baseDir,
      currentPath: subpath,
      files: fileStats
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Save config file
app.post('/api/config-files', async (req, res) => {
  try {
    const { filename, content } = req.body;

    if (!filename || !content) {
      return res.status(400).json({
        success: false,
        error: 'Filename and content are required'
      });
    }

    // Ensure filename ends with .json
    const sanitizedFilename = filename.endsWith('.json') ? filename : `${filename}.json`;

    // Security check
    if (sanitizedFilename.includes('..') || path.isAbsolute(sanitizedFilename)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid filename'
      });
    }

    const userId = getUserId(req);
    const configsDir = UserStorage.getUserConfigsDir(userId);
    const filePath = path.join(configsDir, sanitizedFilename);

    // Ensure directory exists
    await fs.mkdir(configsDir, { recursive: true });

    // Check if file exists
    const resolvedPath = path.resolve(filePath);
    const resolvedBase = path.resolve(configsDir);
    if (!resolvedPath.startsWith(resolvedBase)) {
      return res.status(400).json({
        success: false,
        error: 'Access denied'
      });
    }

    // Save the file
    await fs.writeFile(filePath, JSON.stringify(content, null, 2));

    res.json({
      success: true,
      filename: sanitizedFilename,
      message: 'Configuration saved successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Delete config file
app.delete('/api/config-file/:filename', async (req, res) => {
  try {
    const filename = req.params.filename;
    const userId = getUserId(req);
    const configsDir = UserStorage.getUserConfigsDir(userId);
    const filePath = path.join(configsDir, filename);

    // Security check
    if (filename.includes('..') || path.isAbsolute(filename)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid filename'
      });
    }

    // Check if file exists and is within the configs directory
    const resolvedPath = path.resolve(filePath);
    const resolvedBase = path.resolve(configsDir);
    if (!resolvedPath.startsWith(resolvedBase)) {
      return res.status(400).json({
        success: false,
        error: 'Access denied'
      });
    }

    // Delete the file
    await fs.unlink(filePath);

    res.json({
      success: true,
      message: 'Configuration deleted successfully'
    });
  } catch (error) {
    res.status(404).json({
      success: false,
      error: 'File not found'
    });
  }
});

// Save output file
app.post('/api/output-files', async (req, res) => {
  try {
    const { filename, content, path: filePath } = req.body;

    if (!filename || content === undefined) {
      return res.status(400).json({
        success: false,
        error: 'Filename and content are required'
      });
    }

    const userId = getUserId(req);
    const outputsDir = UserStorage.getUserOutputDir(userId);

    // Determine full path
    let fullPath;
    if (filePath && filePath.includes('/')) {
      // If path is provided, use it
      fullPath = path.join(UserStorage.getUserBaseDir(userId), filePath);
    } else {
      // Otherwise save to outputs directory
      fullPath = path.join(outputsDir, filename);
    }

    // Security check
    const resolvedPath = path.resolve(fullPath);
    const resolvedBase = path.resolve(UserStorage.getUserBaseDir(userId));
    if (!resolvedPath.startsWith(resolvedBase)) {
      return res.status(400).json({
        success: false,
        error: 'Access denied'
      });
    }

    // Ensure directory exists
    await fs.mkdir(path.dirname(fullPath), { recursive: true });

    // Save the file
    if (typeof content === 'object') {
      await fs.writeFile(fullPath, JSON.stringify(content, null, 2));
    } else {
      await fs.writeFile(fullPath, content);
    }

    res.json({
      success: true,
      filename: filename,
      path: path.relative(UserStorage.getUserBaseDir(userId), fullPath),
      message: 'File saved successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Chat endpoint
app.post('/api/chat', async (req, res) => {
  try {
    const { model, messages, attachments } = req.body;

    console.log('Chat request:', { model, messageCount: messages?.length, attachments });

    if (!model || !messages) {
      return res.status(400).json({
        success: false,
        error: 'Model and messages are required'
      });
    }

    // Process attachments if provided
    const processedMessages = [...messages];
    if (attachments && attachments.length > 0) {
      console.log('Processing attachments:', attachments);
      const userId = getUserId(req);
      const lastUserMessageIndex = processedMessages.findLastIndex(m => m.role === 'user');

      if (lastUserMessageIndex !== -1) {
        let attachmentContent = '\n\n--- Attached Files ---\n';

        for (const attachment of attachments) {
          try {
            let filePath;

            // Determine file path based on the attachment path or type
            if (attachment.path) {
              // Attachment path is relative to user directory
              const userBaseDir = UserStorage.getUserBaseDir(userId);
              filePath = path.join(userBaseDir, attachment.path);
            } else if (attachment.type) {
              // Legacy format with type field
              if (attachment.type === 'uploads') {
                filePath = path.join(UserStorage.getUserUploadsDir(userId), attachment.name);
              } else if (attachment.type === 'configs') {
                filePath = path.join(UserStorage.getUserConfigsDir(userId), attachment.name);
              } else if (attachment.type === 'output') {
                filePath = path.join(UserStorage.getUserOutputDir(userId), attachment.name);
              }
            }

            if (filePath && await fs.access(filePath).then(() => true).catch(() => false)) {
              const ext = path.extname(attachment.name).toLowerCase();

              // Check if it's an image file
              const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp'];
              if (imageExtensions.includes(ext)) {
                // For images, convert to base64 and include in message for vision models
                try {
                  const imageBuffer = await fs.readFile(filePath);
                  const base64Image = imageBuffer.toString('base64');
                  const mimeType = ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' :
                    ext === '.png' ? 'image/png' :
                      ext === '.gif' ? 'image/gif' :
                        ext === '.webp' ? 'image/webp' : 'image/jpeg';

                  // Instead of appending text, we'll modify the message format for vision models
                  // Store image data for later processing
                  if (!processedMessages[lastUserMessageIndex].images) {
                    processedMessages[lastUserMessageIndex].images = [];
                  }
                  processedMessages[lastUserMessageIndex].images.push({
                    type: 'image_url',
                    image_url: {
                      url: `data:${mimeType};base64,${base64Image}`
                    }
                  });

                  console.log(`Added image ${attachment.name} to message as base64`);
                } catch (error) {
                  console.error(`Failed to read image ${attachment.name}:`, error);
                  attachmentContent += `\nFile: ${attachment.name} (Image file - could not be processed)\n`;
                }
              } else {
                // For text files, read the content
                try {
                  const content = await fs.readFile(filePath, 'utf-8');

                  // Limit content size for large files
                  const maxSize = 10000; // 10KB of text
                  const truncatedContent = content.length > maxSize
                    ? content.substring(0, maxSize) + '\n... [truncated]'
                    : content;

                  attachmentContent += `\nFile: ${attachment.name}\n`;
                  attachmentContent += `\`\`\`${ext.slice(1) || 'text'}\n${truncatedContent}\n\`\`\`\n`;
                } catch (readError) {
                  // If we can't read as text, it might be a binary file
                  attachmentContent += `\nFile: ${attachment.name} (Binary file - cannot display content)\n`;
                }
              }
            }
          } catch (error) {
            console.error(`Failed to read attachment ${attachment.name}:`, error);
            attachmentContent += `\nFile: ${attachment.name} [Error reading file]\n`;
          }
        }

        // Append attachment content to the last user message
        if (attachmentContent && attachmentContent.trim() !== '\n\n--- Attached Files ---\n') {
          processedMessages[lastUserMessageIndex] = {
            ...processedMessages[lastUserMessageIndex],
            content: processedMessages[lastUserMessageIndex].content + attachmentContent
          };
        }

        // If we have images, convert message to multimodal format
        if (processedMessages[lastUserMessageIndex].images && processedMessages[lastUserMessageIndex].images.length > 0) {
          const images = processedMessages[lastUserMessageIndex].images;
          const textContent = processedMessages[lastUserMessageIndex].content;

          // Convert to OpenRouter multimodal format
          processedMessages[lastUserMessageIndex] = {
            role: 'user',
            content: [
              {
                type: 'text',
                text: textContent
              },
              ...images
            ]
          };

          console.log('Converted message to multimodal format with', images.length, 'image(s)');
        } else {
          console.log('Modified message with attachments:', processedMessages[lastUserMessageIndex].content);
        }
      }
    }

    const client = await createApiClient({}, req);
    const response = await client.generateCompletion(processedMessages, {
      model: model,
      temperature: 0.7,
      maxTokens: 2000,
      format: 'text',
      verbose: true
    });

    console.log('Chat response:', JSON.stringify(response, null, 2));

    if (response && response.data) {
      const message = response.data;
      const usage = response.usage;

      console.log('Message to send:', message);

      // Calculate cost based on model pricing
      const modelsResponse = await client.getModels();
      let totalCost = 0;

      if (modelsResponse.success && modelsResponse.models) {
        const modelInfo = modelsResponse.models.find(m => m.id === model);

        if (modelInfo && modelInfo.pricing && usage) {
          const promptCost = (usage.prompt_tokens || 0) * modelInfo.pricing.prompt;
          const completionCost = (usage.completion_tokens || 0) * modelInfo.pricing.completion;
          totalCost = promptCost + completionCost;
        }
      }

      const responseData = {
        success: true,
        message: message,
        usage: {
          prompt_tokens: usage?.prompt_tokens || 0,
          completion_tokens: usage?.completion_tokens || 0,
          total_tokens: usage?.total_tokens || 0,
          total_cost: totalCost
        }
      };

      console.log('Sending response:', JSON.stringify(responseData));
      res.json(responseData);
    } else {
      res.json({
        success: false,
        error: 'Failed to generate response'
      });
    }
  } catch (error) {
    console.error('Chat error:', error);

    // Check if it's a temporary OpenRouter issue
    if (error.message?.includes('temporarily unavailable') || error.response?.status === 503) {
      res.status(503).json({
        success: false,
        error: 'OpenRouter service is temporarily unavailable. Please try again in a few moments.',
        isTemporary: true
      });
    } else if (error.response?.status === 401) {
      res.status(401).json({
        success: false,
        error: 'API key is invalid or missing. Please check your OpenRouter API key.',
        isAuthError: true
      });
    } else {
      res.status(500).json({
        success: false,
        error: error.message || 'An unexpected error occurred'
      });
    }
  }
});

// Serve the main dashboard
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Serve the chat page
app.get('/chat', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'chat.html'));
});

// Initialize server
async function startServer() {
  try {
    // Initialize authManager before starting server
    authManager = await authManagerPromise;
    console.log('✅ Authentication system initialized');

    // Cleanup stale generations periodically
    setInterval(async () => {
      try {
        await authManager.cleanupStaleGenerations();
      } catch (error) {
        console.error('Failed to cleanup stale generations:', error);
      }
    }, 60000); // Every minute

    // Ensure base directory exists
    await UserStorage.ensureBaseDir();

    // Initialize default admin user if no users exist
    try {
      const users = await authManager.getAllUsers();
      if (users.length === 0) {
        console.log('📋 No users found. Creating default admin user...');
        const adminUser = await authManager.createUser('admin@admin.com', 'admin123');
        // Make the first user an admin
        await authManager.updateUserRole(adminUser.userId, 1);
        console.log('✅ Default admin user created:');
        console.log('   Email: admin@admin.com');
        console.log('   Password: admin123');
        console.log('   ⚠️  Please change the password after first login!');
      }
    } catch (error) {
      console.error('❌ Error checking/creating admin user:', error.message);
    }

    // Start server
    const HOST = process.env.LOCAL_NETWORK_MODE === 'true' ? '0.0.0.0' : 'localhost';
    app.listen(PORT, HOST, () => {
      console.log(`🚀 LLM Data Generator Web UI running at http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
      if (process.env.LOCAL_NETWORK_MODE === 'true') {
        // Get local IP address
        const interfaces = os.networkInterfaces();
        const addresses = [];
        for (const name of Object.keys(interfaces)) {
          for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
              addresses.push(iface.address);
            }
          }
        }
        console.log('🌐 Also accessible from local network at:');
        addresses.forEach(addr => {
          console.log(`   http://${addr}:${PORT}`);
        });
      }
      console.log(`📁 Static files served from: ${path.join(__dirname, 'public')}`);
    });

  } catch (error) {
    console.error('❌ Failed to start server:', error.message);
    process.exit(1);
  }
}

// Start the server
startServer();

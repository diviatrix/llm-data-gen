import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';
import multer from 'multer';
import os from 'os';
import { ConfigManager } from './lib/configManager.js';
import { DataGenerator } from './lib/generator.js';
import { readJsonFile } from './lib/utils/fileIO.js';
import { createApiClient } from './lib/sessionManager.js';
import { CloudUserPaths } from './lib/userManager.js';
import { authManager } from './lib/auth.js';
import fs from 'fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Trust proxy to get real client IP
app.set('trust proxy', true);

// Helper function to check if IP is private
function isPrivateIP(ip) {
  const parts = ip.split('.').map(Number);
  return (
    (parts[0] === 10) || // 10.0.0.0/8
    (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) || // 172.16.0.0/12
    (parts[0] === 192 && parts[1] === 168) || // 192.168.0.0/16
    (parts[0] === 127) // 127.0.0.0/8 (loopback)
  );
}

// Middleware to detect localhost vs cloud mode
app.use((req, res, next) => {
  const isLocalhost = req.hostname === 'localhost' || req.hostname === '127.0.0.1' || req.hostname === '::1';

  // Get client IP
  const clientIP = req.ip || req.connection.remoteAddress || '';
  const cleanIP = clientIP.replace(/^::ffff:/, ''); // Remove IPv6 prefix if present

  // Check for local network mode
  const isLocalNetwork = process.env.LOCAL_NETWORK_MODE === 'true' &&
    (isLocalhost || isPrivateIP(req.hostname) || isPrivateIP(cleanIP));

  // Debug logging
  if (process.env.LOCAL_NETWORK_MODE === 'true') {
    console.log(`[Auth] Request from: hostname=${req.hostname}, ip=${cleanIP}, isLocalNetwork=${isLocalNetwork}`);
  }

  // Allow forcing cloud mode for testing
  if (process.env.FORCE_CLOUD_MODE === 'true') {
    req.isAdmin = false;
    req.isCloud = true;
  } else {
    // Only localhost is admin (no password required)
    req.isAdmin = isLocalhost;
    // Everything else is cloud mode (requires authentication)
    req.isCloud = !isLocalhost;
  }

  next();
});

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Mode detection endpoint (before auth middleware)
app.get('/api/mode', (req, res) => {
  res.json({
    isCloud: req.isCloud,
    isAdmin: req.isAdmin
  });
});

// Auth middleware for cloud mode
async function requireAuth(req, res, next) {
  // Skip auth for auth endpoints
  if (req.originalUrl.startsWith('/api/auth/')) {
    return next();
  }

  // Skip auth for localhost/admin
  if (req.isAdmin) {
    return next();
  }

  // Check authorization header
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : null;

  if (!token) {
    return res.status(401).json({ success: false, error: 'Authentication required' });
  }

  try {
    const session = await authManager.validateSession(token);
    if (!session) {
      return res.status(401).json({ success: false, error: 'Invalid or expired session' });
    }

    req.user = session;

    // Try to get user's API key
    try {
      // We need the password hash to decrypt, so we'll need to modify validateSession to return it
      // For now, we'll fetch it when needed
      if (session.userId) {
        const hasKey = await authManager.hasApiKey(session.userId);
        if (hasKey) {
          // We'll need to pass the password hash somehow, for now skip
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

// Apply auth middleware to all API routes in cloud mode
app.use('/api/*', requireAuth);

// Helper function to get user-specific paths
function getReqUserPaths(req) {
  return CloudUserPaths.getPathsForRequest(req);
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

    const hasKey = await authManager.hasApiKey(req.user.userId);
    res.json({ success: true, hasKey });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to check API key' });
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

    await authManager.saveApiKey(req.user.userId, apiKey);
    res.json({ success: true, message: 'API key saved successfully' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Failed to save API key' });
  }
});

app.delete('/api/user/api-key', async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, error: 'Not authenticated' });
    }

    await authManager.deleteApiKey(req.user.userId);
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

// Admin endpoints (localhost only)
app.get('/api/admin/users', async (req, res) => {
  if (!req.isAdmin) {
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
  if (!req.isAdmin) {
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
    await CloudUserPaths.ensureUserDirs(result.userId);
    await CloudUserPaths.copyDefaultConfigs(result.userId);

    res.json({ success: true, ...result });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
});

app.put('/api/admin/users/:id/toggle', async (req, res) => {
  if (!req.isAdmin) {
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
  if (!req.isAdmin) {
    return res.status(403).json({ success: false, error: 'Admin access only' });
  }

  try {
    const userId = parseInt(req.params.id);

    // Clean up user data
    await CloudUserPaths.cleanupUserData(userId);

    // Delete user from database
    await authManager.deleteUser(userId);

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/admin/users/:id/reset-password', async (req, res) => {
  if (!req.isAdmin) {
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

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', version: '1.0.0' });
});

// Get account info
app.get('/api/account', async (req, res) => {
  try {
    // For cloud users, require API key
    if (req.isCloud && req.user && !req.userHasApiKey) {
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
    const client = await createApiClient();
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
    if (req.isCloud && req.user) {
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

// Generate data with streaming progress (Server-Sent Events)
app.post('/api/generate-stream', async (req, res) => {
  try {
    // Get config from request body
    const { config } = req.body;

    // Set SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });

    // Send initial event
    res.write(`data: ${JSON.stringify({ type: 'start' })}\n\n`);

    // For cloud users, check if they have an API key
    if (req.isCloud && req.user) {
      if (!req.userHasApiKey) {
        res.write(`data: ${JSON.stringify({
          type: 'error',
          error: 'API key required. Please set your OpenRouter API key in settings.'
        })}\n\n`);
        res.end();
        return;
      }
    }

    // Create generator with progress callback
    const generator = new DataGenerator(config, {
      req,
      onProgress: (progress) => {
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
      // Send error event
      res.write(`data: ${JSON.stringify({
        type: 'error',
        error: error.message,
        code: error.code
      })}\n\n`);
    }

    res.end();
  } catch (error) {
    console.error('Generate stream error:', error);
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

// Get output directory files
app.get('/api/output-files', async (req, res) => {
  try {
    const { subpath = '' } = req.query;
    const paths = getReqUserPaths(req);
    const baseDir = paths.getUserOutputDir();
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
    const paths = getReqUserPaths(req);
    const baseDir = paths.getUserOutputDir();
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
      // For non-JSON files, send as download
      res.download(filePath);
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
    const paths = getReqUserPaths(req);
    const baseDir = paths.getUserOutputDir();
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
    const paths = getReqUserPaths(req);
    const configsDir = paths.getUserConfigsDir();
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
    const paths = getReqUserPaths(req);
    const baseDir = paths.getUserConfigsDir();
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

    const paths = getReqUserPaths(req);
    const configsDir = paths.getUserConfigsDir();
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
    const paths = getReqUserPaths(req);
    const configsDir = paths.getUserConfigsDir();
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

    const paths = getReqUserPaths(req);
    const outputsDir = paths.getUserOutputsDir();

    // Determine full path
    let fullPath;
    if (filePath && filePath.includes('/')) {
      // If path is provided, use it
      fullPath = path.join(paths.getUserDir(), filePath);
    } else {
      // Otherwise save to outputs directory
      fullPath = path.join(outputsDir, filename);
    }

    // Security check
    const resolvedPath = path.resolve(fullPath);
    const resolvedBase = path.resolve(paths.getUserDir());
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
      path: path.relative(paths.getUserDir(), fullPath),
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
    const { model, messages } = req.body;

    console.log('Chat request:', { model, messageCount: messages?.length });

    if (!model || !messages) {
      return res.status(400).json({
        success: false,
        error: 'Model and messages are required'
      });
    }

    const client = await createApiClient();
    const response = await client.generateCompletion(messages, {
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

// Start server
const HOST = process.env.LOCAL_NETWORK_MODE === 'true' ? '0.0.0.0' : 'localhost';
app.listen(PORT, HOST, async () => {
  // Ensure localhost user directories exist
  await CloudUserPaths.ensureUserDirs('localhost');
  await CloudUserPaths.copyDefaultConfigs('localhost');

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

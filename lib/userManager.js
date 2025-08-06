import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import { UserStorage } from './userStorage.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Re-export UserStorage methods with cloud-specific aliases for backward compatibility
export class CloudUserPaths {
  static async ensureUserDataDir() {
    return UserStorage.ensureBaseDir();
  }

  static getUserBaseDir(userId) {
    return UserStorage.getUserBaseDir(userId);
  }

  static getUserConfigsDir(userId) {
    return UserStorage.getUserConfigsDir(userId);
  }

  static getUserOutputDir(userId) {
    return UserStorage.getUserOutputDir(userId);
  }

  static async ensureUserDirs(userId) {
    return UserStorage.ensureUserDirs(userId);
  }

  static async copyDefaultConfigs(userId) {
    return UserStorage.copySystemConfigs(userId);
  }

  static async fileExists(filePath) {
    return UserStorage.fileExists(filePath);
  }

  static async getUserStorageInfo(userId) {
    const userDir = UserStorage.getUserBaseDir(userId);

    async function getDirectorySize(dir) {
      let size = 0;
      try {
        const files = await fs.readdir(dir, { withFileTypes: true });

        for (const file of files) {
          const filePath = path.join(dir, file.name);

          if (file.isDirectory()) {
            size += await getDirectorySize(filePath);
          } else {
            const stats = await fs.stat(filePath);
            size += stats.size;
          }
        }
      } catch (error) {
        // Directory might not exist
      }

      return size;
    }

    const totalSize = await getDirectorySize(userDir);

    return {
      totalBytes: totalSize,
      totalMB: (totalSize / (1024 * 1024)).toFixed(2),
      outputSize: await getDirectorySize(UserStorage.getUserOutputDir(userId)),
      configSize: await getDirectorySize(UserStorage.getUserConfigsDir(userId))
    };
  }

  static async cleanupUserData(userId) {
    const userDir = UserStorage.getUserBaseDir(userId);

    try {
      await fs.rm(userDir, { recursive: true, force: true });
      return true;
    } catch (error) {
      console.error('Error cleaning up user data:', error);
      return false;
    }
  }

  static resolveOutputPath(outputPath, userId) {
    // In cloud mode, all paths are relative to user's output directory
    const userOutputDir = UserStorage.getUserOutputDir(userId);

    if (path.isAbsolute(outputPath)) {
      // Convert absolute paths to relative
      const relativePath = path.basename(outputPath);
      return path.join(userOutputDir, relativePath);
    }

    // Clean the path
    const cleanPath = outputPath.replace(/^\.\//, '');

    // Remove any 'output/' prefix as we're already in the user's output dir
    const finalPath = cleanPath.replace(/^output\//, '');

    return path.join(userOutputDir, finalPath);
  }

  // Middleware helper to inject user paths based on mode
  static getPathsForRequest(req) {
    // For ALL web requests (cloud or localhost), use user-specific paths
    // This ensures generated files are accessible from the web interface
    if (req) {
      const userId = req.user?.userId || 'localhost';

      // Return user-specific paths
      return {
        getUserDataDir: () => UserStorage.getUserBaseDir(userId),
        getUserConfigsDir: () => UserStorage.getUserConfigsDir(userId),
        getUserOutputDir: () => UserStorage.getUserOutputDir(userId),
        resolveOutputPath: (path) => this.resolveOutputPath(path, userId),
        findConfigFile: async (filename) => {
          const userConfigPath = path.join(UserStorage.getUserConfigsDir(userId), filename);
          if (await UserStorage.fileExists(userConfigPath)) {
            return userConfigPath;
          }

          const userExamplePath = path.join(UserStorage.getUserConfigsDir(userId), 'examples', filename);
          if (await UserStorage.fileExists(userExamplePath)) {
            return userExamplePath;
          }

          throw new Error(`Config file not found: ${filename}`);
        }
      };
    } else {
      // CLI mode - return standard UserStorage methods
      return UserStorage;
    }
  }
}

// Re-export for backward compatibility
export const getUserApiKeyPath = (userId) => UserStorage.getUserApiKeyPath(userId);

// Middleware for API key loading
export async function loadUserApiKey(req, res, next) {
  // Skip API key loading for certain routes
  if (req.path.startsWith('/auth/') || req.path === '/health') {
    return next();
  }

  try {
    // In local admin mode, API key comes from environment
    if (req.isLocalAdmin) {
      req.userApiKey = process.env.OPENROUTER_API_KEY;
    } else if (req.user) {
      // In cloud mode, load from user's .env file
      const apiKeyPath = UserStorage.getUserApiKeyPath(req.user.userId);

      try {
        const envContent = await fs.readFile(apiKeyPath, 'utf-8');
        const lines = envContent.split('\n');

        for (const line of lines) {
          if (line.startsWith('OPENROUTER_API_KEY=')) {
            req.userApiKey = line.substring('OPENROUTER_API_KEY='.length).trim();
            break;
          }
        }
      } catch (error) {
        // API key file doesn't exist yet
        req.userApiKey = null;
      }
    }

    // For unauthenticated requests, check for API key in Authorization header
    if (!req.user && !req.isLocalAdmin && req.headers.authorization) {
      const authHeader = req.headers.authorization;
      if (authHeader.startsWith('Bearer ')) {
        req.userApiKey = authHeader.substring(7);
      }
    }

    next();
  } catch (error) {
    console.error('Error loading user API key:', error);
    next(); // Continue even if API key loading fails
  }
}

// Import user model and authentication methods
import Database from 'better-sqlite3';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { nanoid } from 'nanoid';

// Database setup
const dbPath = path.join(__dirname, '..', 'db', 'users.db');
await fs.mkdir(path.dirname(dbPath), { recursive: true });

const db = new Database(dbPath);

// Initialize database
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    last_login DATETIME,
    is_active BOOLEAN DEFAULT 1
  )
`);

// Password reset tokens table
db.exec(`
  CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    token TEXT UNIQUE NOT NULL,
    expires_at DATETIME NOT NULL,
    used BOOLEAN DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  )
`);

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const TOKEN_EXPIRY = '24h';

export class UserManager {
  static async createUser(email, password) {
    const hashedPassword = await bcrypt.hash(password, 10);

    try {
      const stmt = db.prepare('INSERT INTO users (email, password) VALUES (?, ?)');
      const result = stmt.run(email, hashedPassword);

      const createdUser = {
        id: result.lastInsertRowid,
        email
      };

      // Ensure user data directory exists
      await UserStorage.ensureUserStructure(createdUser.id);

      return createdUser;
    } catch (error) {
      if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        throw new Error('User with this email already exists');
      }
      throw error;
    }
  }

  static async authenticate(email, password) {
    const stmt = db.prepare('SELECT * FROM users WHERE email = ? AND is_active = 1');
    const user = stmt.get(email);

    if (!user) {
      return null;
    }

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      return null;
    }

    // Update last login
    const updateStmt = db.prepare('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?');
    updateStmt.run(user.id);

    const token = jwt.sign(
      { userId: user.id, email: user.email },
      JWT_SECRET,
      { expiresIn: TOKEN_EXPIRY }
    );

    return {
      user: {
        id: user.id,
        email: user.email
      },
      token
    };
  }

  static async getUserByEmail(email) {
    const stmt = db.prepare('SELECT id, email, created_at, last_login, is_active FROM users WHERE email = ?');
    return stmt.get(email);
  }

  static async getUserById(id) {
    const stmt = db.prepare('SELECT id, email, created_at, last_login, is_active FROM users WHERE id = ?');
    return stmt.get(id);
  }

  static async listUsers() {
    const stmt = db.prepare('SELECT id, email, created_at, last_login, is_active FROM users ORDER BY created_at DESC');
    return stmt.all();
  }

  static async updatePassword(userId, newPassword) {
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    const stmt = db.prepare('UPDATE users SET password = ? WHERE id = ?');
    const result = stmt.run(hashedPassword, userId);
    return result.changes > 0;
  }

  static async deactivateUser(userId) {
    const stmt = db.prepare('UPDATE users SET is_active = 0 WHERE id = ?');
    const result = stmt.run(userId);
    return result.changes > 0;
  }

  static async reactivateUser(userId) {
    const stmt = db.prepare('UPDATE users SET is_active = 1 WHERE id = ?');
    const result = stmt.run(userId);
    return result.changes > 0;
  }

  static async deleteUser(userId) {
    // Clean up user data
    await CloudUserPaths.cleanupUserData(userId);

    // Delete from database
    const stmt = db.prepare('DELETE FROM users WHERE id = ?');
    const result = stmt.run(userId);
    return result.changes > 0;
  }

  static async createPasswordResetToken(userId) {
    const token = nanoid(32);
    const expiresAt = new Date(Date.now() + 3600000); // 1 hour from now

    const stmt = db.prepare('INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES (?, ?, ?)');
    stmt.run(userId, token, expiresAt.toISOString());

    return token;
  }

  static async validatePasswordResetToken(token) {
    const stmt = db.prepare(`
      SELECT prt.*, u.email 
      FROM password_reset_tokens prt
      JOIN users u ON prt.user_id = u.id
      WHERE prt.token = ? 
        AND prt.expires_at > datetime('now')
        AND prt.used = 0
    `);

    return stmt.get(token);
  }

  static async usePasswordResetToken(token) {
    const stmt = db.prepare('UPDATE password_reset_tokens SET used = 1 WHERE token = ?');
    const result = stmt.run(token);
    return result.changes > 0;
  }

  static verifyToken(token) {
    try {
      return jwt.verify(token, JWT_SECRET);
    } catch (error) {
      return null;
    }
  }
}

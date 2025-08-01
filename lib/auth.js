import bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import sqlite3 from 'sqlite3';
import { promisify } from 'util';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Database path
const DB_PATH = path.join(__dirname, '..', 'db', 'users.db');

class AuthManager {
  constructor() {
    this.db = null;
    this.initDatabase();
  }

  async initDatabase() {
    // Ensure db directory exists
    await fs.mkdir(path.dirname(DB_PATH), { recursive: true });

    // Create database connection
    this.db = new sqlite3.Database(DB_PATH);

    // Promisify database methods with proper context
    const dbRun = this.db.run.bind(this.db);
    const dbGet = this.db.get.bind(this.db);
    const dbAll = this.db.all.bind(this.db);

    this.db.runAsync = function (...args) {
      return new Promise((resolve, reject) => {
        dbRun(...args, function (err) {
          if (err) reject(err);
          else resolve({ lastID: this.lastID, changes: this.changes });
        });
      });
    };

    this.db.getAsync = promisify(dbGet);
    this.db.allAsync = promisify(dbAll);

    // Create tables if not exist
    await this.createTables();
  }

  async createTables() {
    // Users table
    await this.db.runAsync(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_login DATETIME,
        is_active BOOLEAN DEFAULT 1,
        storage_used INTEGER DEFAULT 0,
        settings TEXT DEFAULT '{}'
      )
    `);

    // API keys table
    await this.db.runAsync(`
      CREATE TABLE IF NOT EXISTS api_keys (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        encrypted_key TEXT NOT NULL,
        key_salt TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_used DATETIME,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    // Sessions table
    await this.db.runAsync(`
      CREATE TABLE IF NOT EXISTS sessions (
        token TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        expires_at DATETIME NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    // Create indexes
    await this.db.runAsync('CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON api_keys(user_id)');
    await this.db.runAsync('CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id)');
    await this.db.runAsync('CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at)');
  }

  // User management methods
  async createUser(email, password) {
    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      throw new Error('Invalid email format');
    }

    // Validate password length
    if (password.length < 6) {
      throw new Error('Password must be at least 6 characters long');
    }

    // Check if user already exists
    const existingUser = await this.db.getAsync(
      'SELECT id FROM users WHERE email = ?',
      [email]
    );

    if (existingUser) {
      throw new Error('User with this email already exists');
    }

    const passwordHash = await bcrypt.hash(password, 10);

    try {
      const result = await this.db.runAsync(
        'INSERT INTO users (email, password_hash) VALUES (?, ?)',
        [email, passwordHash]
      );

      return {
        success: true,
        userId: result.lastID,
        email
      };
    } catch (error) {
      if (error.message.includes('UNIQUE constraint failed')) {
        throw new Error('User with this email already exists');
      }
      throw error;
    }
  }

  async getUserByEmail(email) {
    return await this.db.getAsync(
      'SELECT * FROM users WHERE email = ?',
      [email]
    );
  }

  async getUserById(userId) {
    return await this.db.getAsync(
      'SELECT * FROM users WHERE id = ?',
      [userId]
    );
  }

  async updatePassword(userId, newPassword) {
    const passwordHash = await bcrypt.hash(newPassword, 10);

    await this.db.runAsync(
      'UPDATE users SET password_hash = ? WHERE id = ?',
      [passwordHash, userId]
    );
  }

  async updateUserSettings(userId, settings) {
    await this.db.runAsync(
      'UPDATE users SET settings = ? WHERE id = ?',
      [JSON.stringify(settings), userId]
    );
  }

  async setUserApiKey(userId, apiKey) {
    await this.db.runAsync(
      'UPDATE users SET api_key = ? WHERE id = ?',
      [apiKey, userId]
    );
  }

  // Authentication methods
  async authenticate(email, password) {
    const user = await this.getUserByEmail(email);

    if (!user) {
      throw new Error('Invalid email or password');
    }

    if (!user.is_active) {
      throw new Error('Account is disabled');
    }

    const isValid = await bcrypt.compare(password, user.password_hash);

    if (!isValid) {
      throw new Error('Invalid email or password');
    }

    // Update last login
    await this.db.runAsync(
      'UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = ?',
      [user.id]
    );

    // Create session
    const token = uuidv4();
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24); // 24 hour session

    await this.db.runAsync(
      'INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)',
      [token, user.id, expiresAt.toISOString()]
    );

    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        settings: JSON.parse(user.settings || '{}'),
        hasApiKey: !!user.api_key
      }
    };
  }

  async validateSession(token) {
    if (!token) {
      return null;
    }

    // Clean up expired sessions
    await this.db.runAsync(
      'DELETE FROM sessions WHERE expires_at < CURRENT_TIMESTAMP'
    );

    const session = await this.db.getAsync(
      `SELECT s.*, u.email, u.is_active, u.settings, u.api_key
       FROM sessions s
       JOIN users u ON s.user_id = u.id
       WHERE s.token = ? AND s.expires_at > CURRENT_TIMESTAMP`,
      [token]
    );

    if (!session || !session.is_active) {
      return null;
    }

    return {
      userId: session.user_id,
      email: session.email,
      settings: JSON.parse(session.settings || '{}'),
      apiKey: session.api_key
    };
  }

  async logout(token) {
    await this.db.runAsync(
      'DELETE FROM sessions WHERE token = ?',
      [token]
    );
  }

  // Admin methods
  async getAllUsers() {
    return await this.db.allAsync(
      `SELECT id, email, created_at, last_login, is_active, storage_used,
              CASE WHEN api_key IS NOT NULL THEN 1 ELSE 0 END as has_api_key
       FROM users
       ORDER BY created_at DESC`
    );
  }

  async toggleUserActive(userId) {
    await this.db.runAsync(
      'UPDATE users SET is_active = NOT is_active WHERE id = ?',
      [userId]
    );
  }

  async deleteUser(userId) {
    // Delete user sessions first
    await this.db.runAsync(
      'DELETE FROM sessions WHERE user_id = ?',
      [userId]
    );

    // Delete user
    await this.db.runAsync(
      'DELETE FROM users WHERE id = ?',
      [userId]
    );
  }

  async updateStorageUsed(userId, bytes) {
    await this.db.runAsync(
      'UPDATE users SET storage_used = ? WHERE id = ?',
      [bytes, userId]
    );
  }

  // Cleanup method
  async cleanup() {
    await this.db.runAsync(
      'DELETE FROM sessions WHERE expires_at < CURRENT_TIMESTAMP'
    );
  }

  // API Key management
  async saveApiKey(userId, apiKey) {
    // Generate salt for this key
    const salt = await bcrypt.genSalt(10);

    // Encrypt the API key using bcrypt (one-way encryption)
    // For two-way encryption, we'd need to use crypto module
    const crypto = await import('crypto');

    // Create a hash of the user's password to use as encryption key
    const user = await this.db.getAsync('SELECT password_hash FROM users WHERE id = ?', [userId]);
    if (!user) throw new Error('User not found');

    // Use a combination of password hash and salt for encryption
    const key = crypto.createHash('sha256').update(user.password_hash + salt).digest();
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    let encrypted = cipher.update(apiKey, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    // Store IV with encrypted data
    const encryptedWithIv = iv.toString('hex') + ':' + encrypted;

    // Delete existing key if any
    await this.db.runAsync('DELETE FROM api_keys WHERE user_id = ?', [userId]);

    // Insert new key
    await this.db.runAsync(
      'INSERT INTO api_keys (user_id, encrypted_key, key_salt) VALUES (?, ?, ?)',
      [userId, encryptedWithIv, salt]
    );
  }

  async getApiKey(userId, passwordHash) {
    const keyData = await this.db.getAsync(
      'SELECT encrypted_key, key_salt FROM api_keys WHERE user_id = ?',
      [userId]
    );

    if (!keyData) return null;

    try {
      const crypto = await import('crypto');

      // Split IV from encrypted data
      const [ivHex, encrypted] = keyData.encrypted_key.split(':');
      const iv = Buffer.from(ivHex, 'hex');

      // Recreate the same key
      const key = crypto.createHash('sha256').update(passwordHash + keyData.key_salt).digest();
      const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      // Update last used
      await this.db.runAsync(
        'UPDATE api_keys SET last_used = CURRENT_TIMESTAMP WHERE user_id = ?',
        [userId]
      );

      return decrypted;
    } catch (error) {
      console.error('Failed to decrypt API key:', error);
      return null;
    }
  }

  async deleteApiKey(userId) {
    await this.db.runAsync('DELETE FROM api_keys WHERE user_id = ?', [userId]);
  }

  async hasApiKey(userId) {
    const result = await this.db.getAsync(
      'SELECT COUNT(*) as count FROM api_keys WHERE user_id = ?',
      [userId]
    );
    return result.count > 0;
  }
}

export const authManager = new AuthManager();

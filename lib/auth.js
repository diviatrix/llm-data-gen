import bcrypt from 'bcrypt';
import { randomUUID } from 'node:crypto';
import sqlite3 from 'sqlite3';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Database path
const DB_PATH = path.join(__dirname, '..', 'db', 'users.db');

class AuthManager {
  constructor() {
    this.db = null;
  }

  static async init() {
    const instance = new AuthManager();
    await instance.initDatabase();
    return instance;
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
    // Roles table
    await this.db.runAsync(`
      CREATE TABLE IF NOT EXISTS roles (
        id INTEGER PRIMARY KEY,
        name TEXT UNIQUE NOT NULL,
        permissions TEXT DEFAULT '{}',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Insert default roles if they don't exist
    await this.db.runAsync(`
      INSERT OR IGNORE INTO roles (id, name, permissions) VALUES 
      (1, 'admin', '{"manage_users": true, "manage_roles": true, "view_all_data": true}'),
      (2, 'user', '{"manage_own_data": true}')
    `);

    // Users table
    await this.db.runAsync(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        role_id INTEGER DEFAULT 2,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_login DATETIME,
        is_active BOOLEAN DEFAULT 1,
        storage_used INTEGER DEFAULT 0,
        storage_quota INTEGER DEFAULT 10485760,
        settings TEXT DEFAULT '{}',
        FOREIGN KEY (role_id) REFERENCES roles(id)
      )
    `);

    // Check if we need to migrate existing users
    const columnInfo = await this.db.allAsync('PRAGMA table_info(users)');
    const hasRoleId = columnInfo.some(col => col.name === 'role_id');
    const hasStorageUsed = columnInfo.some(col => col.name === 'storage_used');
    const hasStorageQuota = columnInfo.some(col => col.name === 'storage_quota');
    const hasSettings = columnInfo.some(col => col.name === 'settings');
    const hasPasswordHash = columnInfo.some(col => col.name === 'password_hash');
    const hasPassword = columnInfo.some(col => col.name === 'password');

    if (!hasRoleId) {
      // Add role_id column to existing users table
      await this.db.runAsync('ALTER TABLE users ADD COLUMN role_id INTEGER DEFAULT 2');

      // Make the first user an admin
      await this.db.runAsync(`
        UPDATE users SET role_id = 1 WHERE id = (SELECT MIN(id) FROM users)
      `);
    }

    if (!hasStorageUsed) {
      // Add storage_used column to existing users table
      await this.db.runAsync('ALTER TABLE users ADD COLUMN storage_used INTEGER DEFAULT 0');
    }

    if (!hasStorageQuota) {
      // Add storage_quota column to existing users table (10MB default)
      await this.db.runAsync('ALTER TABLE users ADD COLUMN storage_quota INTEGER DEFAULT 10485760');
    }

    if (!hasSettings) {
      // Add settings column to existing users table
      await this.db.runAsync('ALTER TABLE users ADD COLUMN settings TEXT DEFAULT \'{}\'');
    }

    if (!hasPasswordHash) {
      // Add password_hash column to existing users table
      await this.db.runAsync('ALTER TABLE users ADD COLUMN password_hash TEXT');

      // If there are existing users with old password column, migrate them
      if (hasPassword) {
        const existingUsers = await this.db.allAsync('SELECT id, password FROM users WHERE password IS NOT NULL AND password_hash IS NULL');
        for (const user of existingUsers) {
          // Hash the existing plaintext password
          const hashedPassword = await bcrypt.hash(user.password, 10);
          await this.db.runAsync('UPDATE users SET password_hash = ? WHERE id = ?', [hashedPassword, user.id]);
        }
        console.log(`✅ Migrated ${existingUsers.length} user passwords to hashed format`);
      } else {
        // If there are existing users without password_hash, they need to reset password
        const existingUsers = await this.db.allAsync('SELECT id FROM users WHERE password_hash IS NULL');
        if (existingUsers.length > 0) {
          console.log('⚠️  Found existing users without password hashes. They will need to reset their passwords.');
        }
      }
    }

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

    // Active generations table
    await this.db.runAsync(`
      CREATE TABLE IF NOT EXISTS active_generations (
        id TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL,
        config_name TEXT,
        model TEXT,
        status TEXT DEFAULT 'running',
        progress_current INTEGER DEFAULT 0,
        progress_total INTEGER DEFAULT 0,
        estimated_cost REAL,
        started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_heartbeat DATETIME DEFAULT CURRENT_TIMESTAMP,
        logs TEXT,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    // Generation history table
    await this.db.runAsync(`
      CREATE TABLE IF NOT EXISTS generation_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        config_name TEXT,
        model TEXT,
        status TEXT DEFAULT 'completed',
        items_generated INTEGER DEFAULT 0,
        total_cost REAL DEFAULT 0,
        total_tokens INTEGER DEFAULT 0,
        prompt_tokens INTEGER DEFAULT 0,
        completion_tokens INTEGER DEFAULT 0,
        errors TEXT,
        output_files TEXT,
        metadata TEXT,
        started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        completed_at DATETIME,
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
      // Check if the table has both password and password_hash columns
      const columnInfo = await this.db.allAsync('PRAGMA table_info(users)');
      const hasPassword = columnInfo.some(col => col.name === 'password');
      const hasPasswordHash = columnInfo.some(col => col.name === 'password_hash');

      let query, params;
      if (hasPassword && hasPasswordHash) {
        // Both columns exist - use both for compatibility
        query = 'INSERT INTO users (email, password, password_hash) VALUES (?, ?, ?)';
        params = [email, password, passwordHash];
      } else if (hasPasswordHash) {
        // Only password_hash column exists
        query = 'INSERT INTO users (email, password_hash) VALUES (?, ?)';
        params = [email, passwordHash];
      } else if (hasPassword) {
        // Only password column exists (old schema)
        query = 'INSERT INTO users (email, password) VALUES (?, ?)';
        params = [email, passwordHash]; // Still store hashed even in password column
      } else {
        throw new Error('Database schema error: no password column found');
      }

      const result = await this.db.runAsync(query, params);

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
      `SELECT u.*, r.name as role_name, r.permissions 
       FROM users u 
       LEFT JOIN roles r ON u.role_id = r.id 
       WHERE u.email = ?`,
      [email]
    );
  }

  async getUserById(userId) {
    return await this.db.getAsync(
      `SELECT u.*, r.name as role_name, r.permissions 
       FROM users u 
       LEFT JOIN roles r ON u.role_id = r.id 
       WHERE u.id = ?`,
      [userId]
    );
  }

  async getUserRole(userId) {
    const user = await this.getUserById(userId);
    return user ? user.role_name : null;
  }

  async hasPermission(userId, permission) {
    const user = await this.getUserById(userId);
    if (!user || !user.permissions) return false;

    try {
      const permissions = JSON.parse(user.permissions);
      return permissions[permission] === true;
    } catch {
      return false;
    }
  }

  async updateUserRole(userId, roleId) {
    await this.db.runAsync(
      'UPDATE users SET role_id = ? WHERE id = ?',
      [roleId, userId]
    );
  }

  async getRoles() {
    return await this.db.allAsync('SELECT * FROM roles ORDER BY id');
  }

  async createRole(name, permissions = {}) {
    const result = await this.db.runAsync(
      'INSERT INTO roles (name, permissions) VALUES (?, ?)',
      [name, JSON.stringify(permissions)]
    );
    return result.lastID;
  }

  async updateRole(roleId, permissions) {
    await this.db.runAsync(
      'UPDATE roles SET permissions = ? WHERE id = ?',
      [JSON.stringify(permissions), roleId]
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
    const token = randomUUID();
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
        role: user.role_name,
        permissions: user.permissions ? JSON.parse(user.permissions) : {},
        settings: JSON.parse(user.settings || '{}'),
        hasApiKey: !!user.api_key
      }
    };
  }

  async validateSession(token) {
    if (!token) {
      console.log('No token provided to validateSession');
      return null;
    }

    // Clean up expired sessions
    await this.db.runAsync(
      'DELETE FROM sessions WHERE expires_at < CURRENT_TIMESTAMP'
    );

    console.log('Looking up session for token:', token);
    let session;
    try {
      session = await this.db.getAsync(
        `SELECT s.*, u.email, u.is_active, u.settings, 
                u.role_id, r.name as role_name, r.permissions
         FROM sessions s
         JOIN users u ON s.user_id = u.id
         LEFT JOIN roles r ON u.role_id = r.id
         WHERE s.token = ? AND s.expires_at > CURRENT_TIMESTAMP`,
        [token]
      );

      console.log('Session query result:', session);
    } catch (error) {
      console.error('Database error in validateSession:', error);
      return null;
    }

    if (!session || !session.is_active) {
      console.log('Session invalid or user inactive:', { session: !!session, is_active: session?.is_active });
      return null;
    }

    return {
      userId: session.user_id,
      email: session.email,
      role: session.role_name,
      permissions: session.permissions ? JSON.parse(session.permissions) : {},
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
      `SELECT u.id, u.email, u.created_at, u.last_login, u.is_active, u.storage_used, u.storage_quota,
              u.role_id, r.name as role_name,
              CASE WHEN EXISTS(SELECT 1 FROM api_keys WHERE user_id = u.id) THEN 1 ELSE 0 END as has_api_key
       FROM users u
       LEFT JOIN roles r ON u.role_id = r.id
       ORDER BY u.created_at DESC`
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

  async getStorageInfo(userId) {
    const user = await this.db.getAsync(
      'SELECT storage_used, storage_quota FROM users WHERE id = ?',
      [userId]
    );
    return {
      used: user?.storage_used || 0,
      quota: user?.storage_quota || 10485760, // 10MB default
      available: (user?.storage_quota || 10485760) - (user?.storage_used || 0)
    };
  }

  async canUploadFile(userId, fileSize) {
    const storage = await this.getStorageInfo(userId);
    return storage.available >= fileSize;
  }

  async addStorageUsed(userId, bytes) {
    await this.db.runAsync(
      'UPDATE users SET storage_used = storage_used + ? WHERE id = ?',
      [bytes, userId]
    );
  }

  async subtractStorageUsed(userId, bytes) {
    await this.db.runAsync(
      'UPDATE users SET storage_used = MAX(0, storage_used - ?) WHERE id = ?',
      [bytes, userId]
    );
  }

  // Cleanup method
  async cleanup() {
    await this.db.runAsync(
      'DELETE FROM sessions WHERE expires_at < CURRENT_TIMESTAMP'
    );
  }

  // Active generation methods
  async createActiveGeneration(data) {
    const result = await this.db.runAsync(
      `INSERT INTO active_generations (
        id, user_id, config_name, model, status, 
        progress_current, progress_total, estimated_cost, logs
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.id,
        data.userId,
        data.configName || null,
        data.model || null,
        data.status || 'running',
        data.progressCurrent || 0,
        data.progressTotal || 0,
        data.estimatedCost || 0,
        JSON.stringify(data.logs || [])
      ]
    );
    return data.id;
  }

  async updateActiveGeneration(id, updates) {
    const setClauses = [];
    const values = [];

    if (updates.status !== undefined) {
      setClauses.push('status = ?');
      values.push(updates.status);
    }
    if (updates.progressCurrent !== undefined) {
      setClauses.push('progress_current = ?');
      values.push(updates.progressCurrent);
    }
    if (updates.progressTotal !== undefined) {
      setClauses.push('progress_total = ?');
      values.push(updates.progressTotal);
    }
    if (updates.logs !== undefined) {
      setClauses.push('logs = ?');
      values.push(JSON.stringify(updates.logs));
    }

    setClauses.push('last_heartbeat = CURRENT_TIMESTAMP');
    values.push(id);

    await this.db.runAsync(
      `UPDATE active_generations SET ${setClauses.join(', ')} WHERE id = ?`,
      values
    );
  }

  async deleteActiveGeneration(id) {
    await this.db.runAsync('DELETE FROM active_generations WHERE id = ?', [id]);
  }

  async getActiveGenerations(userId = null) {
    const query = userId
      ? 'SELECT * FROM active_generations WHERE user_id = ? ORDER BY started_at DESC'
      : 'SELECT * FROM active_generations ORDER BY started_at DESC';

    const rows = await this.db.allAsync(query, userId ? [userId] : []);

    return rows.map(row => ({
      ...row,
      logs: row.logs ? JSON.parse(row.logs) : []
    }));
  }

  async cleanupStaleGenerations() {
    // Remove generations with no heartbeat for 5 minutes
    await this.db.runAsync(
      `DELETE FROM active_generations 
       WHERE datetime(last_heartbeat) < datetime('now', '-5 minutes')`
    );
  }

  // Generation history methods
  async saveGenerationHistory(userId, data) {
    const result = await this.db.runAsync(
      `INSERT INTO generation_history (
        user_id, config_name, model, status, items_generated, 
        total_cost, total_tokens, prompt_tokens, completion_tokens,
        errors, output_files, metadata, completed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      [
        userId,
        data.configName || null,
        data.model || null,
        data.status || 'completed',
        data.itemsGenerated || 0,
        data.totalCost || 0,
        data.totalTokens || 0,
        data.promptTokens || 0,
        data.completionTokens || 0,
        data.errors ? JSON.stringify(data.errors) : null,
        data.outputFiles ? JSON.stringify(data.outputFiles) : null,
        data.metadata ? JSON.stringify(data.metadata) : null
      ]
    );
    return result.lastID;
  }

  async getGenerationHistory(userId, limit = 50) {
    const rows = await this.db.allAsync(
      `SELECT * FROM generation_history 
       WHERE user_id = ? 
       ORDER BY started_at DESC 
       LIMIT ?`,
      [userId, limit]
    );

    // Parse JSON fields
    return rows.map(row => ({
      ...row,
      errors: row.errors ? JSON.parse(row.errors) : [],
      outputFiles: row.output_files ? JSON.parse(row.output_files) : [],
      metadata: row.metadata ? JSON.parse(row.metadata) : {}
    }));
  }

  async deleteGenerationHistory(userId, generationId) {
    // Verify the generation belongs to the user before deleting
    const generation = await this.db.getAsync(
      'SELECT id FROM generation_history WHERE id = ? AND user_id = ?',
      [generationId, userId]
    );

    if (!generation) {
      throw new Error('Generation not found or access denied');
    }

    await this.db.runAsync(
      'DELETE FROM generation_history WHERE id = ? AND user_id = ?',
      [generationId, userId]
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

export const authManager = AuthManager.init();

import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Base directory for all user data
const USER_DATA_DIR = path.join(__dirname, '..', 'user-data');

export class UserStorage {
  static async ensureBaseDir() {
    await fs.mkdir(USER_DATA_DIR, { recursive: true });
  }

  static getUserBaseDir(userId) {
    // Use user-0 for CLI mode (no authentication)
    const id = userId || 0;
    return path.join(USER_DATA_DIR, `user-${id}`);
  }

  static getUserConfigsDir(userId) {
    return path.join(this.getUserBaseDir(userId), 'configs');
  }

  static getUserOutputDir(userId) {
    return path.join(this.getUserBaseDir(userId), 'output');
  }

  static getUserApiKeyPath(userId) {
    return path.join(this.getUserBaseDir(userId), '.env');
  }

  static getSystemConfigsDir() {
    return path.join(__dirname, '..', 'configs');
  }

  static async ensureUserDirs(userId) {
    const dirs = [
      this.getUserBaseDir(userId),
      this.getUserConfigsDir(userId),
      this.getUserOutputDir(userId),
      path.join(this.getUserConfigsDir(userId), 'examples')
    ];

    for (const dir of dirs) {
      await fs.mkdir(dir, { recursive: true });
    }
  }

  static async copySystemConfigs(userId) {
    const systemConfigsDir = this.getSystemConfigsDir();
    const userConfigsDir = this.getUserConfigsDir(userId);

    try {
      // Copy default.json
      const defaultConfigPath = path.join(userConfigsDir, 'default.json');
      const systemDefaultPath = path.join(systemConfigsDir, 'default.json');

      if (!await this.fileExists(defaultConfigPath) && await this.fileExists(systemDefaultPath)) {
        await fs.copyFile(systemDefaultPath, defaultConfigPath);
      }

      // Copy examples
      const systemExamplesDir = path.join(systemConfigsDir, 'examples');
      const userExamplesDir = path.join(userConfigsDir, 'examples');

      if (await this.fileExists(systemExamplesDir)) {
        const exampleFiles = await fs.readdir(systemExamplesDir);
        for (const file of exampleFiles) {
          if (file.endsWith('.json')) {
            const userFilePath = path.join(userExamplesDir, file);
            if (!await this.fileExists(userFilePath)) {
              await fs.copyFile(
                path.join(systemExamplesDir, file),
                userFilePath
              );
            }
          }
        }
      }

      return true;
    } catch (error) {
      console.error('Error copying system configs:', error.message);
      return false;
    }
  }

  static async fileExists(filePath) {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  static async ensureUserStructure(userId) {
    await this.ensureUserDirs(userId);
    await this.copySystemConfigs(userId);
  }

  // Migration helper for moving from old structure
  static async migrateFromUserPaths() {
    try {
      const { UserPaths } = await import('./userPaths.js');
      const oldDataDir = UserPaths.getUserDataDir();

      if (await this.fileExists(oldDataDir)) {

        // Copy configs
        const oldConfigsDir = UserPaths.getUserConfigsDir();
        if (await this.fileExists(oldConfigsDir)) {
          await this.copyDirectory(oldConfigsDir, this.getUserConfigsDir(0));
        }

        // Copy outputs
        const oldOutputDir = UserPaths.getUserOutputDir();
        if (await this.fileExists(oldOutputDir)) {
          await this.copyDirectory(oldOutputDir, this.getUserOutputDir(0));
        }

        console.log('Migration from old UserPaths structure completed');
      }
    } catch (error) {
      // UserPaths might not exist anymore, that's fine
      console.log('No migration needed');
    }
  }

  static async copyDirectory(src, dest) {
    await fs.mkdir(dest, { recursive: true });
    const entries = await fs.readdir(src, { withFileTypes: true });

    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);

      if (entry.isDirectory()) {
        await this.copyDirectory(srcPath, destPath);
      } else {
        await fs.copyFile(srcPath, destPath);
      }
    }
  }
}

import path from 'node:path';
import fs from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const USER_DATA_DIR = path.join(__dirname, '..', 'user-data');

export class UserStorage {
  static async ensureBaseDir() {
    await fs.mkdir(USER_DATA_DIR, { recursive: true });
  }

  static getUserBaseDir(userId) {
    const id = userId || 0;
    return path.join(USER_DATA_DIR, `user-${id}`);
  }

  static getUserFilesDir(userId) {
    // All user files in one directory
    return path.join(this.getUserBaseDir(userId), 'files');
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
      this.getUserFilesDir(userId),
      path.join(this.getUserFilesDir(userId), 'examples')
    ];

    for (const dir of dirs) {
      await fs.mkdir(dir, { recursive: true });
    }
  }

  static async copySystemConfigs(userId) {
    const systemConfigsDir = this.getSystemConfigsDir();
    const userConfigsDir = this.getUserFilesDir(userId);

    try {
      const defaultConfigPath = path.join(userConfigsDir, 'default.json');
      const systemDefaultPath = path.join(systemConfigsDir, 'default.json');

      if (!await this.fileExists(defaultConfigPath) && await this.fileExists(systemDefaultPath)) {
        await fs.copyFile(systemDefaultPath, defaultConfigPath);
      }

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

  static async getUserApiKey(userId) {
    const envPath = this.getUserApiKeyPath(userId);
    try {
      const envContent = await fs.readFile(envPath, 'utf-8');
      const lines = envContent.split('\n');
      for (const line of lines) {
        if (line.startsWith('OPENROUTER_API_KEY=')) {
          return line.substring('OPENROUTER_API_KEY='.length).trim();
        }
      }
    } catch (error) {
      // File doesn't exist or can't be read
    }
    return null;
  }

  static async migrateFromUserPaths() {
    try {
      const { UserPaths } = await import('./userPaths.js');
      const oldDataDir = UserPaths.getUserDataDir();

      if (await this.fileExists(oldDataDir)) {

        const oldConfigsDir = UserPaths.getUserConfigsDir();
        if (await this.fileExists(oldConfigsDir)) {
          await this.copyDirectory(oldConfigsDir, this.getUserFilesDir(0));
        }

        const oldOutputDir = UserPaths.getUserOutputDir();
        if (await this.fileExists(oldOutputDir)) {
          await this.copyDirectory(oldOutputDir, this.getUserFilesDir(0));
        }

        console.log('Migration from old UserPaths structure completed');
      }
    } catch (error) {
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

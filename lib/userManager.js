import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import { UserPaths } from './userPaths.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Base directory for user data
const USER_DATA_DIR = path.join(__dirname, '..', 'user-data');

export class CloudUserPaths {
  static async ensureUserDataDir() {
    await fs.mkdir(USER_DATA_DIR, { recursive: true });
  }

  static getUserBaseDir(userId) {
    return path.join(USER_DATA_DIR, `user-${userId}`);
  }

  static getUserConfigsDir(userId) {
    return path.join(this.getUserBaseDir(userId), 'configs');
  }

  static getUserOutputDir(userId) {
    return path.join(this.getUserBaseDir(userId), 'output');
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

  static async copyDefaultConfigs(userId) {
    const systemConfigsDir = UserPaths.getSystemConfigsDir();
    const userConfigsDir = this.getUserConfigsDir(userId);

    try {
      // Copy default.json
      const defaultConfigPath = path.join(userConfigsDir, 'default.json');
      const systemDefaultPath = path.join(systemConfigsDir, 'default.json');

      if (await this.fileExists(systemDefaultPath) && !await this.fileExists(defaultConfigPath)) {
        await fs.copyFile(systemDefaultPath, defaultConfigPath);
      }

      // Copy example configs
      const systemExamplesDir = path.join(systemConfigsDir, 'examples');
      const userExamplesDir = path.join(userConfigsDir, 'examples');

      try {
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
      } catch (error) {
        // Examples directory might not exist
        console.log('No example configs to copy');
      }

      return true;
    } catch (error) {
      console.error('Error copying default configs:', error.message);
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

  static async getUserStorageInfo(userId) {
    const userDir = this.getUserBaseDir(userId);

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
      outputSize: await getDirectorySize(this.getUserOutputDir(userId)),
      configSize: await getDirectorySize(this.getUserConfigsDir(userId))
    };
  }

  static async cleanupUserData(userId) {
    const userDir = this.getUserBaseDir(userId);

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
    const userOutputDir = this.getUserOutputDir(userId);

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
        getUserDataDir: () => this.getUserBaseDir(userId),
        getUserConfigsDir: () => this.getUserConfigsDir(userId),
        getUserOutputDir: () => this.getUserOutputDir(userId),
        resolveOutputPath: (path) => this.resolveOutputPath(path, userId),
        findConfigFile: async (filename) => {
          const userConfigPath = path.join(this.getUserConfigsDir(userId), filename);
          if (await this.fileExists(userConfigPath)) {
            return userConfigPath;
          }

          const userExamplePath = path.join(this.getUserConfigsDir(userId), 'examples', filename);
          if (await this.fileExists(userExamplePath)) {
            return userExamplePath;
          }

          throw new Error(`Config file not found: ${filename}`);
        }
      };
    } else {
      // CLI mode - return standard UserPaths methods
      return UserPaths;
    }
  }
}

// Helper function to get appropriate paths based on context
export function getUserPaths(context = {}) {
  if (context.isCloud && context.userId) {
    return CloudUserPaths;
  }
  return UserPaths;
}

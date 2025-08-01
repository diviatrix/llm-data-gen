import os from 'os';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class UserPaths {
  static getUserDataDir() {
    const homeDir = os.homedir();
    const platform = process.platform;

    let documentsDir;
    if (platform === 'win32') {
      documentsDir = path.join(homeDir, 'Documents');
    } else if (platform === 'darwin') {
      documentsDir = path.join(homeDir, 'Documents');
    } else {
      try {
        documentsDir = execSync('xdg-user-dir DOCUMENTS', { encoding: 'utf8' }).trim();
      } catch {
        documentsDir = process.env.XDG_DOCUMENTS_DIR || path.join(homeDir, 'Documents');
      }
    }

    return path.join(documentsDir, 'llmdatagen');
  }

  static getUserConfigsDir() {
    return path.join(this.getUserDataDir(), 'configs');
  }

  static getUserOutputDir() {
    return path.join(this.getUserDataDir(), 'output');
  }

  static getSystemConfigsDir() {
    return path.join(__dirname, '..', 'configs');
  }

  static async ensureUserDirs() {
    const dirs = [
      this.getUserDataDir(),
      this.getUserConfigsDir(),
      this.getUserOutputDir(),
      path.join(this.getUserConfigsDir(), 'examples')
    ];

    for (const dir of dirs) {
      await fs.mkdir(dir, { recursive: true });
    }
  }

  static async copySystemConfigs() {
    const systemConfigsDir = this.getSystemConfigsDir();
    const userConfigsDir = this.getUserConfigsDir();

    try {
      const defaultConfigPath = path.join(userConfigsDir, 'default.json');
      if (!await this.fileExists(defaultConfigPath)) {
        await fs.copyFile(
          path.join(systemConfigsDir, 'default.json'),
          defaultConfigPath
        );
      }

      const systemExamplesDir = path.join(systemConfigsDir, 'examples');
      const userExamplesDir = path.join(userConfigsDir, 'examples');

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

  static async findConfigFile(filename) {
    const userConfigPath = path.join(this.getUserConfigsDir(), filename);
    if (await this.fileExists(userConfigPath)) {
      return userConfigPath;
    }

    const userExamplePath = path.join(this.getUserConfigsDir(), 'examples', filename);
    if (await this.fileExists(userExamplePath)) {
      return userExamplePath;
    }

    const systemConfigPath = path.join(this.getSystemConfigsDir(), filename);
    if (await this.fileExists(systemConfigPath)) {
      console.log(`Note: Using system config as user config not found: ${filename}`);
      return systemConfigPath;
    }

    const systemExamplePath = path.join(this.getSystemConfigsDir(), 'examples', filename);
    if (await this.fileExists(systemExamplePath)) {
      console.log(`Note: Using system example config as user config not found: ${filename}`);
      return systemExamplePath;
    }

    throw new Error(`Config file not found: ${filename}`);
  }

  static resolveOutputPath(outputPath) {
    if (path.isAbsolute(outputPath)) {
      return outputPath;
    }

    const cleanPath = outputPath.replace(/^\.\//, '');

    if (cleanPath.startsWith('output/')) {
      const subPath = cleanPath.substring('output/'.length);
      return subPath ? path.join(this.getUserOutputDir(), subPath) : this.getUserOutputDir();
    }

    if (cleanPath === 'output' || cleanPath === 'output/') {
      return this.getUserOutputDir();
    }

    return path.join(this.getUserDataDir(), cleanPath);
  }
}

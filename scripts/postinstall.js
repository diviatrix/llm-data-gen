#!/usr/bin/env node
import { UserPaths } from '../lib/userPaths.js';
import chalk from 'chalk';

async function postInstall() {
  console.log(chalk.blue('\n🚀 Setting up LLM Data Generator...'));

  try {
    // Create user directories
    await UserPaths.ensureUserDirs();
    console.log(chalk.green('✓ Created user directories in Documents/llmdatagen'));

    // Copy system configs
    const copied = await UserPaths.copySystemConfigs();
    if (copied) {
      console.log(chalk.green('✓ Copied example configurations'));
    }

    console.log(chalk.cyan(`\n📁 Your configurations are stored in: ${UserPaths.getUserConfigsDir()}`));
    console.log(chalk.cyan(`📁 Generated files will be saved to: ${UserPaths.getUserOutputDir()}`));
    console.log(chalk.green('\n✨ Setup complete! Run "llmdatagen" to start generating data.\n'));
  } catch (error) {
    console.error(chalk.red('\n❌ Setup failed:'), error.message);
    console.log(chalk.yellow('\nNote: You can still use the tool, but some features may not work as expected.'));
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  postInstall();
}

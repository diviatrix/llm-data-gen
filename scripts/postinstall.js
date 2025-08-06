#!/usr/bin/env node
import { UserStorage } from '../lib/userStorage.js';
import chalk from 'chalk';

async function postInstall() {
  console.log(chalk.blue('\n🚀 Setting up LLM Data Generator...'));

  try {
    // Ensure base directory exists
    await UserStorage.ensureBaseDir();
    
    // Create user directories for CLI/local mode (user-0)
    await UserStorage.ensureUserStructure(0);
    console.log(chalk.green('✓ Created user directories in user-data/user-0'));

    console.log(chalk.cyan(`\n📁 Your configurations are stored in: ${UserStorage.getUserConfigsDir(0)}`));
    console.log(chalk.cyan(`📁 Generated files will be saved to: ${UserStorage.getUserOutputDir(0)}`));
    console.log(chalk.green('\n✨ Setup complete! Run "llmdatagen" to start generating data.\n'));
  } catch (error) {
    console.error(chalk.red('\n❌ Setup failed:'), error.message);
    console.log(chalk.yellow('\nNote: You can still use the tool, but some features may not work as expected.'));
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  postInstall();
}

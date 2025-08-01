import chalk from 'chalk';

export function success(message, icon = '✓') {
  console.log(chalk.green(`${icon} ${message}`));
}

export function error(message, icon = '❌') {
  console.log(chalk.red(`${icon} ${message}`));
}

export function warning(message, icon = '⚠') {
  console.log(chalk.yellow(`${icon} ${message}`));
}

export function info(message, icon = 'ℹ') {
  console.log(chalk.cyan(`${icon} ${message}`));
}

export function debug(message) {
  console.log(chalk.gray(message));
}

export function header(title) {
  const width = title.length + 4;
  const border = '═'.repeat(width);
  console.log(chalk.bold(`\n╔${border}╗`));
  console.log(chalk.bold(`║  ${title}  ║`));
  console.log(chalk.bold(`╚${border}╝\n`));
}

export function section(title, icon = '📁') {
  console.log(chalk.bold(`\n${icon} ${title}`));
}

export function list(items, { indent = '  ', bullet = '-' } = {}) {
  items.forEach(item => {
    console.log(`${indent}${bullet} ${item}`);
  });
}

export function keyValue(key, value, { indent = '  ', separator = ':' } = {}) {
  console.log(`${indent}${chalk.gray(key)}${separator} ${value}`);
}

export function progress(current, total, label = 'Progress') {
  const percent = Math.round((current / total) * 100);
  console.log(chalk.blue(`${label}: ${current}/${total} (${percent}%)`));
}

export function cost(amount, currency = '$') {
  const formatted = typeof amount === 'number' ? amount.toFixed(4) : amount;
  return chalk.yellow(`${currency}${formatted}`);
}

export function modelInfo(model, price = null) {
  if (price !== null) {
    return `${model} (${cost(price)}/M tokens)`;
  }
  return model;
}

export function formatBytes(bytes) {
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(2)} ${units[unitIndex]}`;
}

export function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
}

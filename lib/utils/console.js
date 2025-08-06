import { green, red, yellow, cyan, gray, blue, bold } from './colors.js';

export function success(message, icon = '✓') {
  console.log(green(`${icon} ${message}`));
}

export function error(message, icon = '❌') {
  console.log(red(`${icon} ${message}`));
}

export function warning(message, icon = '⚠') {
  console.log(yellow(`${icon} ${message}`));
}

export function info(message, icon = 'ℹ') {
  console.log(cyan(`${icon} ${message}`));
}

export function debug(message) {
  console.log(gray(message));
}

export function header(title) {
  const width = title.length + 4;
  const border = '═'.repeat(width);
  console.log(bold(`\n╔${border}╗`));
  console.log(bold(`║  ${title}  ║`));
  console.log(bold(`╚${border}╝\n`));
}

export function section(title, icon = '📁') {
  console.log(bold(`\n${icon} ${title}`));
}

export function list(items, { indent = '  ', bullet = '-' } = {}) {
  items.forEach(item => {
    console.log(`${indent}${bullet} ${item}`);
  });
}

export function keyValue(key, value, { indent = '  ', separator = ':' } = {}) {
  console.log(`${indent}${gray(key)}${separator} ${value}`);
}

export function progress(current, total, label = 'Progress') {
  const percent = Math.round((current / total) * 100);
  console.log(blue(`${label}: ${current}/${total} (${percent}%)`));
}

export function cost(amount, currency = '$') {
  const formatted = typeof amount === 'number' ? amount.toFixed(4) : amount;
  return yellow(`${currency}${formatted}`);
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

// lightweight color routines, no external dependencies and small foot‑print.
const codes = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  underscore: '\x1b[4m',

  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m',

  bgBlue: '\x1b[44m'
};

function style(text, code) {
  if (!process.stdout.isTTY) return text;
  const c = codes[code];
  return c ? `${c}${text}${codes.reset}` : text;
}

export const chalk = {
  red: (t) => style(t, 'red'),
  green: (t) => style(t, 'green'),
  yellow: (t) => style(t, 'yellow'),
  blue: (t) => style(t, 'blue'),
  cyan: (t) => style(t, 'cyan'),
  white: (t) => style(t, 'white'),
  gray: (t) => style(t, 'gray'),
  bold: (t) => style(t, 'bright'),
  dim: (t) => style(t, 'dim'),
  underline: (t) => style(t, 'underscore'),
  bgBlue: (t) => style(t, 'bgBlue')
};

export const red = (text) => style(text, 'red');
export const green = (text) => style(text, 'green');
export const yellow = (text) => style(text, 'yellow');
export const cyan = (text) => style(text, 'cyan');
export const gray = (text) => style(text, 'gray');
export const blue = (text) => style(text, 'blue');
export const bold = (text) => style(text, 'bright');

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

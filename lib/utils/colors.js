const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  underscore: '\x1b[4m',
  blink: '\x1b[5m',
  reverse: '\x1b[7m',
  hidden: '\x1b[8m',

  black: '\x1b[30m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m',
  grey: '\x1b[90m',

  brightBlack: '\x1b[90m',
  brightRed: '\x1b[91m',
  brightGreen: '\x1b[92m',
  brightYellow: '\x1b[93m',
  brightBlue: '\x1b[94m',
  brightMagenta: '\x1b[95m',
  brightCyan: '\x1b[96m',
  brightWhite: '\x1b[97m',

  bgBlack: '\x1b[40m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
  bgBlue: '\x1b[44m',
  bgMagenta: '\x1b[45m',
  bgCyan: '\x1b[46m',
  bgWhite: '\x1b[47m'
};

function colorize(text, colorName) {
  if (!process.stdout.isTTY) {
    return text;
  }

  const color = colors[colorName];
  if (!color) {
    return text;
  }

  return `${color}${text}${colors.reset}`;
}

export const chalk = new Proxy({}, {
  get(target, prop) {
    if (typeof prop === 'string' && colors[prop]) {
      return (text) => colorize(text, prop);
    }

    if (prop === 'bold') {
      return new Proxy({}, {
        get(target, colorProp) {
          return (text) => colorize(colorize(text, colorProp), 'bright');
        }
      });
    }

    return undefined;
  }
});

export const red = (text) => colorize(text, 'red');
export const green = (text) => colorize(text, 'green');
export const yellow = (text) => colorize(text, 'yellow');
export const blue = (text) => colorize(text, 'blue');
export const magenta = (text) => colorize(text, 'magenta');
export const cyan = (text) => colorize(text, 'cyan');
export const white = (text) => colorize(text, 'white');
export const gray = (text) => colorize(text, 'gray');
export const grey = (text) => colorize(text, 'grey');

export const brightRed = (text) => colorize(text, 'brightRed');
export const brightGreen = (text) => colorize(text, 'brightGreen');
export const brightYellow = (text) => colorize(text, 'brightYellow');
export const brightBlue = (text) => colorize(text, 'brightBlue');
export const brightMagenta = (text) => colorize(text, 'brightMagenta');
export const brightCyan = (text) => colorize(text, 'brightCyan');
export const brightWhite = (text) => colorize(text, 'brightWhite');

export const bold = (text) => colorize(text, 'bright');
export const dim = (text) => colorize(text, 'dim');
export const underline = (text) => colorize(text, 'underscore');

export const error = (text) => colorize(text, 'brightRed');
export const success = (text) => colorize(text, 'brightGreen');
export const warning = (text) => colorize(text, 'brightYellow');
export const info = (text) => colorize(text, 'brightBlue');

export { colorize, colors };

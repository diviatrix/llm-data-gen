import { colorize } from './colors.js';

const spinnerFrames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const successIcon = '✓';
const errorIcon = '✗';

export class Spinner {
  constructor(text = '', options = {}) {
    this.text = text;
    this.color = options.color || 'cyan';
    this.interval = options.interval || 80;
    this.frames = options.frames || spinnerFrames;
    this.stream = options.stream || process.stderr;

    this.id = null;
    this.frameIndex = 0;
    this.isSpinning = false;
    this.hideCursor = options.hideCursor !== false;
  }

  start(text) {
    if (text) {
      this.text = text;
    }

    if (this.isSpinning) {
      return this;
    }

    if (!this.stream.isTTY) {
      // In non-TTY environments, just log the text
      this.stream.write(`${this.text}\n`);
      return this;
    }

    this.isSpinning = true;
    this.frameIndex = 0;

    if (this.hideCursor) {
      this.stream.write('\u001B[?25l'); // Hide cursor
    }

    this.id = setInterval(() => {
      this.render();
    }, this.interval);

    return this;
  }

  stop() {
    if (!this.isSpinning) {
      return this;
    }

    this.isSpinning = false;
    clearInterval(this.id);

    if (this.stream.isTTY) {
      this.stream.write('\r\u001B[K'); // Clear line
      if (this.hideCursor) {
        this.stream.write('\u001B[?25h'); // Show cursor
      }
    }

    return this;
  }

  succeed(text) {
    return this.stopAndPersist({
      symbol: colorize(successIcon, 'green'),
      text: text || this.text
    });
  }

  fail(text) {
    return this.stopAndPersist({
      symbol: colorize(errorIcon, 'red'),
      text: text || this.text
    });
  }

  warn(text) {
    return this.stopAndPersist({
      symbol: colorize('⚠', 'yellow'),
      text: text || this.text
    });
  }

  info(text) {
    return this.stopAndPersist({
      symbol: colorize('ℹ', 'blue'),
      text: text || this.text
    });
  }

  stopAndPersist(options = {}) {
    this.stop();

    const symbol = options.symbol || ' ';
    const text = options.text || this.text;

    this.stream.write(`${symbol} ${text}\n`);
    return this;
  }

  render() {
    if (!this.stream.isTTY) {
      return;
    }

    const frame = this.frames[this.frameIndex];
    const coloredFrame = colorize(frame, this.color);

    this.stream.write(`\r${coloredFrame} ${this.text}`);

    this.frameIndex = (this.frameIndex + 1) % this.frames.length;
  }

  get isEnabled() {
    return this.stream.isTTY;
  }

  set text(value) {
    this._text = value;
  }

  get text() {
    return this._text;
  }
}

// Ora-compatible factory function
export default function ora(textOrOptions, options) {
  if (typeof textOrOptions === 'string') {
    return new Spinner(textOrOptions, options);
  } else {
    const opts = textOrOptions || {};
    return new Spinner(opts.text || '', opts);
  }
}

// Direct export for ESM compatibility
export { ora };

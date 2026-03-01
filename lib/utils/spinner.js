// spinner stub: no animation, minimal footprint
// all methods return the instance so callers can chain but nothing happens.

class Spinner {
  constructor(text = '', options = {}) {
    this.text = text;
  }
  start() { return this; }
  stop() { return this; }
  succeed(text) { if (text) console.log(text); return this; }
  fail(text) { if (text) console.log(text); return this; }
  warn(text) { if (text) console.log(text); return this; }
  info(text) { if (text) console.log(text); return this; }
  stopAndPersist(opts) { if (opts?.text) console.log(opts.text); return this; }
  render() {}
  get isEnabled() { return false; }
  set text(v) { this._text = v; }
  get text() { return this._text; }
}

export default function ora(textOrOptions, options) {
  if (typeof textOrOptions === 'string') {
    return new Spinner(textOrOptions, options);
  }
  const opts = textOrOptions || {};
  return new Spinner(opts.text || '', opts);
}

export { ora };

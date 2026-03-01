import { describe, it } from 'vitest';
import { displayCurrentConfig } from '../../../lib/cli/configWizard.js';

// Ensure displayCurrentConfig prints without error for a basic config.  It
// also covers use of the tiny inline color helpers from console.js.

describe('configWizard display', () => {
  it('renders current configuration without error', () => {
    const config = {
      meta: { name: 'MyConfig' },
      api: { model: 'openrouter/auto', temperature: 0.5 },
      schema: { properties: { foo: { type: 'string' } } },
      generation: { tasks: [ { prompt: 'hi' } ] },
      output: { outputPath: './out' }
    };

    // simply call the function; if it throws, the test will fail
    displayCurrentConfig(config, 'api.model', true);
    displayCurrentConfig(config);
  });
});

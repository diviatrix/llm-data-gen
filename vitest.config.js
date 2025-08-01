import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/**',
        'test/**',
        '**/*.test.js',
        '**/*.spec.js',
        'scripts/**',
        'configs/**',
        'docs/**'
      ]
    },
    testTimeout: 10000,
    hookTimeout: 10000
  }
});

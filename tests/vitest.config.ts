import { defineConfig } from 'vitest/config';
import { sveltekit } from '@sveltejs/kit/vite';

export default defineConfig({
  plugins: [sveltekit()],
  test: {
    // Include test files
    include: ['src/**/*.{test,spec}.{js,ts}', 'tests/**/*.{test,spec}.{js,ts}'],
    
    // Environment
    environment: 'node',
    
    // Global test setup
    setupFiles: ['tests/setup.ts'],
    
    // Coverage configuration
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'tests/',
        '**/*.d.ts',
        '**/*.test.ts',
        '**/*.spec.ts',
        'src/app.html',
        'svelte.config.js',
        'vite.config.ts',
        'vitest.config.ts',
      ],
    },
    
    // Globals (describe, it, expect available without import)
    globals: true,
    
    // Timeout for tests
    testTimeout: 10000,
    
    // Reporter
    reporter: 'verbose',
    
    // Isolate tests
    isolate: true,
    
    // Pool options
    pool: 'forks',
    
    // Environment variables for tests
    env: {
      NODE_ENV: 'test',
    },
  },
});

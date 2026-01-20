import { defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';
import { sveltekit } from '@sveltejs/kit/vite';

export default defineConfig(({ mode }) => {
  // Load .env.test for test mode
  const env = loadEnv(mode, process.cwd(), '');

  return {
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
        // Coverage thresholds (to be enforced later)
        // thresholds: {
        //   lines: 80,
        //   functions: 80,
        //   branches: 80,
        //   statements: 80,
        // },
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
        ...env,
      },

      // Env file to load
      envPrefix: ['VITE_', ''],
    },
  };
});

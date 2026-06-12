import { defineConfig } from '@playwright/test';

export default defineConfig({
	testDir: 'e2e',
	globalSetup: './e2e/global-setup.ts',
	// specs share one dev database, rate limits and config table - keep them serial
	workers: 1,
	use: { baseURL: 'http://localhost:4173' },
	webServer: {
		command: 'npm run build && npm run preview',
		port: 4173,
		reuseExistingServer: !process.env.CI
	}
});

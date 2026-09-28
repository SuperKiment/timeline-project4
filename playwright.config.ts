import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
	testDir: 'e2e',
	testMatch: '**/*.spec.ts',
	use: {
		baseURL: 'http://localhost:4173'
	},
	webServer: {
		command: 'npm run build && sh e2e/prepare.sh && node build',
		port: 4173,
		env: {
			DATA_DIR: '.e2e-data',
			PORT: '4173',
			ORIGIN: 'http://localhost:4173',
			TZ: 'Europe/Paris',
			BODY_SIZE_LIMIT: 'Infinity'
		},
		reuseExistingServer: !process.env.CI
	},
	projects: [
		{ name: 'desktop', use: { ...devices['Desktop Chrome'] } },
		{ name: 'mobile', use: { ...devices['Pixel 7'] } }
	]
});

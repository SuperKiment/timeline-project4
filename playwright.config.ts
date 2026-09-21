import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
	testDir: 'e2e',
	testMatch: '**/*.spec.ts',
	webServer: {
		command: 'npm run build && node build',
		port: 4173,
		env: { PORT: '4173' },
		reuseExistingServer: !process.env.CI
	},
	projects: [
		{ name: 'desktop', use: { ...devices['Desktop Chrome'] } },
		{ name: 'mobile', use: { ...devices['Pixel 7'] } }
	]
});

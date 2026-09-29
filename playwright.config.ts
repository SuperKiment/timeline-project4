import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
	testDir: 'e2e',
	testMatch: '**/*.spec.ts',
	workers: process.env.CI ? 2 : 4,
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
		// "Fresh data" specs must run before anything else writes to the shared DB,
		// so they get their own project that everything else depends on.
		{
			name: 'fresh',
			testMatch: /timeline-empty\.spec\.ts/,
			use: { ...devices['Desktop Chrome'] }
		},
		// Logs alice and bob in once and saves their sessions to e2e/.auth/.
		{
			name: 'setup',
			testMatch: /auth\.setup\.ts/,
			dependencies: ['fresh'],
			use: { ...devices['Desktop Chrome'] }
		},
		{
			name: 'desktop',
			dependencies: ['fresh', 'setup'],
			testIgnore: /(timeline-empty|media)\.spec\.ts/,
			use: { ...devices['Desktop Chrome'] }
		},
		{
			name: 'mobile',
			dependencies: ['fresh', 'setup'],
			testMatch: /(media|nav)\.spec\.ts/,
			use: { ...devices['Pixel 7'] }
		}
	]
});

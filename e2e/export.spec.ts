import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { ALICE_STATE } from './helpers';

test.use({ storageState: ALICE_STATE });

test('exports the account data as JSON from the settings page', async ({ page }) => {
	await page.goto('/parametres');
	const downloadPromise = page.waitForEvent('download');
	await page.getByRole('link', { name: 'Exporter en JSON' }).click();
	const download = await downloadPromise;

	const path = await download.path();
	const json = JSON.parse(await readFile(path, 'utf8'));
	expect(Array.isArray(json.entries)).toBe(true);
});

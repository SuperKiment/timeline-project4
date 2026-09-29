import { expect, test } from '@playwright/test';
import { ALICE, login } from './helpers';

// Runs in the dedicated `fresh` project (see playwright.config.ts), before any
// other spec writes entries: prepare.sh only seeds histoire items (EC-14).
// Locally the dev server is reused (playwright.config.ts), so the DB may already hold
// data from a previous run; skip then. On CI the DB is always fresh, so always assert.
test('fresh data shows the empty state with a CTA to create a first entry (EC-14)', async ({
	page
}) => {
	await login(page, ALICE);
	await page.goto('/');

	if (!process.env.CI) {
		const empty = page.getByRole('heading', { name: 'Votre timeline est vide' });
		const item = page.locator('main a[href^="/entries/"]').first();
		await expect(empty.or(item).first()).toBeVisible();
		test.skip((await empty.count()) === 0, 'DB not fresh (reused dev server)');
	}

	await expect(page.getByRole('heading', { name: 'Votre timeline est vide' })).toBeVisible();
	const cta = page.getByRole('link', { name: 'Ajouter un souvenir', exact: true });
	await expect(cta).toBeVisible();
	await expect(page.getByRole('link', { name: 'Ajouter', exact: true })).toBeVisible();

	await cta.click();
	await expect(page).toHaveURL(/\/entries\/new$/);
});

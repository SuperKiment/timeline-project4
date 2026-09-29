import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { ALICE, login } from './helpers';

/** Unique per test and per project (desktop/mobile run in parallel on one DB). */
function uniqueTitle(testInfo: TestInfo, label: string): string {
	return `${label} ${testInfo.project.name} ${Date.now()}`;
}

/** Creates an entry through the form; returns its detail URL path. */
async function createEntry(page: Page, title: string): Promise<string> {
	await page.goto('/entries/new?date=2024-05-01');
	await page.getByLabel('Titre').fill(title);
	await page.getByRole('button', { name: 'Créer' }).click();
	await expect(page).toHaveURL(/\/entries\/\d+$/);
	return new URL(page.url()).pathname;
}

/** Deletes the entry shown on the current detail page through ConfirmButton. */
async function deleteFromDetail(page: Page): Promise<void> {
	await page.locator('form.actions').getByRole('button', { name: 'Supprimer' }).click();
	await page.getByRole('button', { name: 'Confirmer' }).click();
	await expect(page).toHaveURL('/');
}

test.beforeEach(async ({ page }) => {
	await login(page, ALICE);
});

test('deleted entry leaves timeline and search, is listed in corbeille, and restores (FR-24, AC-8)', async ({
	page
}, testInfo) => {
	const word = `Corbeille${testInfo.project.name}${Date.now()}`;
	const title = `${word} restaurable`;
	await createEntry(page, title);
	await deleteFromDetail(page);

	await expect(page.getByText(title)).toHaveCount(0);

	await page.goto(`/recherche?q=${word}`);
	await expect(page.getByText(/Aucun résultat/)).toBeVisible();

	await page.goto('/corbeille');
	const item = page.getByRole('listitem').filter({ hasText: title });
	await expect(item).toHaveCount(1);
	await expect(item.getByText('Entrée', { exact: true })).toBeVisible();
	await expect(item.getByText(/suppression définitive le /)).toBeVisible();

	await item.getByRole('button', { name: 'Restaurer' }).click();
	await expect(item).toHaveCount(0);

	await page.goto(`/recherche?q=${word}`);
	await expect(page.getByRole('link', { name: new RegExp(word) })).toBeVisible();
});

test('purge asks for confirmation and removes the item for good (EC-16)', async ({
	page
}, testInfo) => {
	const title = uniqueTitle(testInfo, 'Purge');
	const path = await createEntry(page, title);
	await deleteFromDetail(page);

	await page.goto('/corbeille');
	const item = page.getByRole('listitem').filter({ hasText: title });
	await expect(item).toHaveCount(1);

	await item.getByRole('button', { name: 'Supprimer définitivement' }).click();
	const dialog = page.getByRole('dialog', { name: 'Supprimer définitivement ?' });
	await expect(dialog).toBeVisible();

	// Cancelling keeps the item.
	await dialog.getByRole('button', { name: 'Annuler' }).click();
	await expect(item).toHaveCount(1);

	await item.getByRole('button', { name: 'Supprimer définitivement' }).click();
	await dialog.getByRole('button', { name: 'Confirmer' }).click();
	await expect(item).toHaveCount(0);

	await page.reload();
	await expect(page.getByText(title)).toHaveCount(0);
	const response = await page.goto(path);
	expect(response?.status()).toBe(404);
});

import { expect, test, type Page } from '@playwright/test';
import { ALICE_STATE, createEntry, uniqueTitle } from './helpers';

test.use({ storageState: ALICE_STATE });

/** Deletes the entry shown on the current detail page through ConfirmButton. */
async function deleteFromDetail(page: Page): Promise<void> {
	await page.locator('form.actions').getByRole('button', { name: 'Supprimer' }).click();
	await page.getByRole('button', { name: 'Confirmer' }).click();
	await expect(page).toHaveURL('/');
}

test('deleted entry leaves timeline and search, is listed in corbeille, and restores (FR-24, AC-8)', async ({
	page
}) => {
	const word = `Corbeille${Date.now()}`;
	const title = `${word} restaurable`;
	const path = await createEntry(page, { title });
	await deleteFromDetail(page);

	await expect(page.getByText(title)).toHaveCount(0);
	expect((await page.goto(path))?.status()).toBe(404);

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

test('purge asks for confirmation and removes the item for good (EC-16)', async ({ page }) => {
	const title = uniqueTitle('Purge');
	const path = await createEntry(page, { title });
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

import { expect, test } from '@playwright/test';
import { ALICE_STATE, createEntry, pastDay, uniqueTitle } from './helpers';

test.use({ storageState: ALICE_STATE });

// Offset 50 is reserved for this spec.
test('word in a journal entry and an entry description yields 2 clickable results, HTML stays text, garbage query is empty (AC-9, FR-12, EC-15)', async ({
	page
}) => {
	const word = `zqdesktop${Date.now()}`;
	const day = pastDay(50);

	const put = await page.request.put(`/api/journal/${day}`, {
		data: { text: `Journée avec ${word} dedans`, mood: null }
	});
	expect(put.ok()).toBe(true);

	const title = uniqueTitle('Entrée recherche');
	const entryPath = await createEntry(page, {
		title,
		description: `Détail avec <b>${word}</b> aussi`
	});

	await page.goto(`/recherche?q=${word}`);
	const results = page.locator('ul.results');
	await expect(results.getByRole('link')).toHaveCount(2);
	await expect(results.getByText('Entrée', { exact: true })).toBeVisible();
	await expect(results.getByText('Journal', { exact: true })).toBeVisible();
	await expect(results.locator('b')).toHaveCount(0);

	const entryResult = page.locator(`ul.results a[href="${entryPath}"]`);
	await expect(entryResult.locator('.title')).toHaveText(title);
	await expect(entryResult.locator('.snippet')).toContainText(word);
	await expect(page.locator(`ul.results a[href="/journal/${day}"] .snippet`)).toContainText(word);

	await entryResult.click();
	await expect(page).toHaveURL(new RegExp(`${entryPath}$`));

	await page.goto(`/recherche?q=${word}`);
	await page.locator(`a[href="/journal/${day}"]`).click();
	await expect(page).toHaveURL(new RegExp(`/journal/${day}$`));

	const response = await page.goto(`/recherche?q=${encodeURIComponent('"*-')}`);
	expect(response?.status()).toBe(200);
	await expect(page.getByText('Aucun résultat pour « "*- »')).toBeVisible();
});

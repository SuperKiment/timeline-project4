import { expect, test } from '@playwright/test';
import { ALICE, login } from './helpers';

const TZ = 'Europe/Paris';

/** YYYY-MM-DD of `offset` days before today in Europe/Paris. */
function pastDay(offset: number): string {
	const now = new Date();
	const today = new Date(
		`${new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(now)}T12:00:00Z`
	);
	today.setUTCDate(today.getUTCDate() - offset);
	return today.toISOString().slice(0, 10);
}

test.beforeEach(async ({ page }) => {
	await login(page, ALICE);
});

test('word in a journal entry and an entry description yields 2 clickable results (AC-9, FR-12)', async ({
	page
}, testInfo) => {
	const mobile = testInfo.project.name === 'mobile';
	const word = `zq${mobile ? 'mobile' : 'desktop'}${Date.now()}`;
	const day = pastDay(mobile ? 51 : 50);

	const put = await page.request.put(`/api/journal/${day}`, {
		data: { text: `Journée avec ${word} dedans`, mood: null }
	});
	expect(put.ok()).toBe(true);

	await page.goto('/entries/new');
	const title = `Entrée recherche ${testInfo.project.name} ${Date.now()}`;
	await page.getByLabel('Titre').fill(title);
	await page.getByLabel('Description').fill(`Détail avec ${word} aussi`);
	await page.getByRole('button', { name: 'Créer' }).click();
	await expect(page).toHaveURL(/\/entries\/\d+$/);
	const entryPath = new URL(page.url()).pathname;

	await page.goto(`/recherche?q=${word}`);
	const links = page.locator('ul.results').getByRole('link');
	await expect(links).toHaveCount(2);
	await expect(page.locator('ul.results').getByText('Entrée', { exact: true })).toBeVisible();
	await expect(page.locator('ul.results').getByText('Journal', { exact: true })).toBeVisible();

	const entryResult = page.locator(`ul.results a[href="${entryPath}"]`);
	await expect(entryResult.locator('.title')).toHaveText(title);
	await expect(entryResult.locator('.snippet')).toContainText(word);
	await expect(page.locator(`ul.results a[href="/journal/${day}"] .snippet`)).toContainText(word);

	await entryResult.click();
	await expect(page).toHaveURL(new RegExp(`${entryPath}$`));

	await page.goto(`/recherche?q=${word}`);
	await page.locator(`a[href="/journal/${day}"]`).click();
	await expect(page).toHaveURL(new RegExp(`/journal/${day}$`));
});

test('HTML in a description is shown as text in the snippet, never as markup', async ({
	page
}, testInfo) => {
	const word = `zqhtml${testInfo.project.name}${Date.now()}`;
	await page.goto('/entries/new');
	await page.getByLabel('Titre').fill(`Recherche html ${testInfo.project.name} ${Date.now()}`);
	await page.getByLabel('Description').fill(`Avant <b>${word}</b> après`);
	await page.getByRole('button', { name: 'Créer' }).click();
	await expect(page).toHaveURL(/\/entries\/\d+$/);

	await page.goto(`/recherche?q=${word}`);
	const results = page.locator('ul.results');
	await expect(results.getByRole('link')).toHaveCount(1);
	await expect(results.locator('.snippet')).toContainText(word);
	await expect(results.locator('b')).toHaveCount(0);
});

test('garbage query shows the empty message with HTTP 200 (EC-15)', async ({ page }) => {
	const response = await page.goto(`/recherche?q=${encodeURIComponent('"*-')}`);
	expect(response?.status()).toBe(200);
	await expect(page.getByText('Aucun résultat pour « "*- »')).toBeVisible();
});

test('no query shows only the form', async ({ page }) => {
	await page.goto('/recherche');
	await expect(page.getByLabel('Rechercher', { exact: true })).toBeFocused();
	await expect(page.getByText(/Aucun résultat/)).toHaveCount(0);
});

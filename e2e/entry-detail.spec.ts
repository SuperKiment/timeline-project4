import { expect, test } from '@playwright/test';
import { ALICE_STATE, BOB_STATE, createEntry, pastDay, uniqueTitle } from './helpers';

test.use({ storageState: ALICE_STATE });

test('renders markdown and never executes script in the description (AC-16)', async ({ page }) => {
	const title = uniqueTitle('Markdown');
	await createEntry(page, {
		title,
		description:
			'Du **gras** et <script>window.__xss=1</script> puis [lien](javascript:window.__xss=1)',
		location: 'Lyon',
		tags: 'été, plage'
	});

	await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
	await expect(page.locator('.description strong')).toHaveText('gras');
	await expect(page.getByText('Lyon')).toBeVisible();
	await expect(page.getByRole('list', { name: 'Tags' }).getByText('plage')).toBeVisible();
	await expect(page.locator('.description script')).toHaveCount(0);
	await expect(page.locator('.description a[href^="javascript:"]')).toHaveCount(0);
	expect(
		await page.evaluate(() => (window as unknown as { __xss?: number }).__xss)
	).toBeUndefined();
	await expect(page.getByText(/^Créé par Alice le /)).toBeVisible();
});

test('ongoing phase shows "en cours" (EC-1)', async ({ page }) => {
	await createEntry(page, { title: uniqueTitle('Phase'), type: 'phase' });
	await expect(page.getByText(/– en cours$/)).toBeVisible();
});

// Offset 70 is reserved for this spec; the entry starts on that day so the journal
// range (start..today, capped at 366 days) includes it.
test('a journal day within the entry period is linked from the detail page', async ({ page }) => {
	const day = pastDay(70);
	const put = await page.request.put(`/api/journal/${day}`, {
		data: { text: `Journal lié ${Date.now()}`, mood: null }
	});
	expect(put.ok()).toBe(true);

	await createEntry(page, { title: uniqueTitle('Journal lié'), date: day });

	const link = page.locator(`a[href="/journal/${day}"]`);
	await expect(link).toBeVisible();
	await expect(page.getByRole('listitem').filter({ has: link }).getByText('Alice')).toBeVisible();
	await link.click();
	await expect(page).toHaveURL(new RegExp(`/journal/${day}$`));
});

test('editing as the other user shows "modifié par" with their name', async ({
	page,
	browser,
	baseURL
}) => {
	const path = await createEntry(page, { title: uniqueTitle('Modifiée') });
	await expect(page.getByText(/modifié par Alice le\s/)).toBeVisible();

	const bobContext = await browser.newContext({ storageState: BOB_STATE, baseURL });
	try {
		const bob = await bobContext.newPage();
		await bob.goto(`${path}/edit`);
		await bob.getByLabel('Titre').fill(uniqueTitle('Modifiée par bob'));
		await bob.getByRole('button', { name: 'Enregistrer' }).click();
		await expect(bob).toHaveURL(path, { timeout: 15_000 });
		await expect(bob.getByText(/^Créé par Alice le .*, modifié par Bob le\s/)).toBeVisible();
	} finally {
		await bobContext.close();
	}
});

test('detail and edit pages 404 for a missing entry', async ({ page }) => {
	expect((await page.goto('/entries/999999999'))?.status()).toBe(404);
	expect((await page.goto('/entries/999999999/edit'))?.status()).toBe(404);
});

import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { ALICE, BOB, login } from './helpers';

/** YYYY-MM-DD of `offset` days before today in Europe/Paris. */
function pastDay(offset: number): string {
	const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date());
	const d = new Date(`${today}T00:00:00Z`);
	d.setUTCDate(d.getUTCDate() - offset);
	return d.toISOString().slice(0, 10);
}

/** Unique per test and per project (desktop/mobile run in parallel on one DB). */
function uniqueTitle(testInfo: TestInfo, label: string): string {
	return `${label} ${testInfo.project.name} ${Date.now()}`;
}

/** Creates an entry through the form and returns its detail URL path. */
async function createEntry(
	page: Page,
	fields: {
		title: string;
		type?: string;
		description?: string;
		location?: string;
		tags?: string;
		date?: string;
	}
): Promise<string> {
	await page.goto(`/entries/new?date=${fields.date ?? '2024-05-01'}`);
	if (fields.type) await page.getByLabel('Type', { exact: true }).selectOption(fields.type);
	await page.getByLabel('Titre').fill(fields.title);
	if (fields.description) await page.getByLabel('Description').fill(fields.description);
	if (fields.location) await page.getByLabel('Lieu').fill(fields.location);
	if (fields.tags) await page.getByLabel('Tags').fill(fields.tags);
	await page.getByRole('button', { name: 'Créer' }).click();
	await expect(page).toHaveURL(/\/entries\/\d+$/);
	return new URL(page.url()).pathname;
}

test.beforeEach(async ({ page }) => {
	await login(page, ALICE);
});

test('renders markdown and never executes script in the description (AC-16)', async ({
	page
}, testInfo) => {
	const title = uniqueTitle(testInfo, 'Markdown');
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

test('ongoing phase shows "en cours" (EC-1)', async ({ page }, testInfo) => {
	await createEntry(page, { title: uniqueTitle(testInfo, 'Phase'), type: 'phase' });
	await expect(page.getByText(/– en cours$/)).toBeVisible();
});

test('important entry is styled with the accent', async ({ page }, testInfo) => {
	await createEntry(page, { title: uniqueTitle(testInfo, 'Important'), type: 'important' });
	await expect(page.locator('article.important')).toBeVisible();
});

test('edit link goes to the edit page', async ({ page }, testInfo) => {
	const path = await createEntry(page, { title: uniqueTitle(testInfo, 'Lien modifier') });
	await page.getByRole('link', { name: 'Modifier' }).click();
	await expect(page).toHaveURL(`${path}/edit`);
});

test('delete via ConfirmButton redirects home and the detail 404s (FR-13, AC-7)', async ({
	page
}, testInfo) => {
	const path = await createEntry(page, { title: uniqueTitle(testInfo, 'A supprimer') });

	await page.locator('form.actions').getByRole('button', { name: 'Supprimer' }).click();
	await page.getByRole('button', { name: 'Confirmer' }).click();
	await expect(page).toHaveURL('/');

	const response = await page.goto(path);
	expect(response?.status()).toBe(404);
});

// Offsets 70 (desktop) / 71 (mobile) are reserved for this spec; the entry starts on
// that day so the journal range (start..today, capped at 366 days) includes it.
test('a journal day within the entry period is linked from the detail page', async ({
	page
}, testInfo) => {
	const day = pastDay(testInfo.project.name === 'mobile' ? 71 : 70);
	const put = await page.request.put(`/api/journal/${day}`, {
		data: { text: `Journal lié ${testInfo.project.name} ${Date.now()}`, mood: null }
	});
	expect(put.ok()).toBe(true);

	await createEntry(page, { title: uniqueTitle(testInfo, 'Journal lié'), date: day });

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
}, testInfo) => {
	const path = await createEntry(page, { title: uniqueTitle(testInfo, 'Modifiée') });
	await expect(page.getByText(/modifié par Alice le\s/)).toBeVisible();

	const bobContext = await browser.newContext({ baseURL });
	try {
		const bob = await bobContext.newPage();
		await login(bob, BOB);
		await bob.goto(`${path}/edit`);
		await bob.getByLabel('Titre').fill(uniqueTitle(testInfo, 'Modifiée par bob'));
		await bob.getByRole('button', { name: 'Enregistrer' }).click();
		await expect(bob).toHaveURL(path);
		await expect(bob.getByText(/^Créé par Alice le .*, modifié par Bob le\s/)).toBeVisible();
	} finally {
		await bobContext.close();
	}
});

test('detail 404s for a missing entry', async ({ page }) => {
	const response = await page.goto('/entries/999999999');
	expect(response?.status()).toBe(404);
});

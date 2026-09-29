import path from 'node:path';
import { expect, test } from '@playwright/test';
import { ALICE_STATE, BOB_STATE, parisToday, parisTomorrow, pastDay, uniqueTitle } from './helpers';

/**
 * journal-calendar.spec.ts asserts bob has NO entry today: bob never writes
 * for today and alice never deletes her today entry here. Every test uses its
 * own past day.
 */
const DAYS = { write: pastDay(10), draft: pastDay(20), delete: pastDay(30) } as const;

test.use({ storageState: ALICE_STATE });

test('alice writes and uploads a photo, bob sees it read-only and cannot modify it via API (AC-6, FR-16, EC-7)', async ({
	page,
	browser,
	baseURL
}) => {
	const day = DAYS.write;
	const text = uniqueTitle("Texte d'alice");

	await page.goto(`/journal/${day}`);
	await page.getByLabel(/Ce que j'ai vécu/).fill(text);
	await page.getByLabel('Joyeux').check();
	await page.getByRole('button', { name: 'Enregistrer' }).click();
	await expect(page.getByText('Enregistré.')).toBeVisible();

	// Same text again: upsert returns the entry id.
	const put = await page.request.put(`/api/journal/${day}`, { data: { text, mood: '😄' } });
	expect(put.status()).toBe(200);
	const { id } = (await put.json()) as { id: number };

	await page.reload();
	await page
		.getByLabel('Ajouter des photos ou vidéos')
		.setInputFiles(path.join('tests', 'fixtures', 'photo-exif-rotated.jpg'));
	const own = page.getByRole('region', { name: 'Mon journal' });
	await expect(own.getByRole('button', { name: 'Agrandir la photo' }).first()).toBeVisible();

	const bobContext = await browser.newContext({ storageState: BOB_STATE, baseURL });
	try {
		const bob = await bobContext.newPage();
		await bob.goto(`/journal/${day}`);

		const partner = bob.getByRole('region', { name: "Journal de l'autre" });
		await expect(partner).toContainText(text);
		await expect(partner.getByRole('button', { name: 'Agrandir la photo' }).first()).toBeVisible();
		await expect(partner.getByRole('button', { name: 'Supprimer' })).toHaveCount(0);
		await expect(bob.locator('textarea')).not.toHaveValue(text);

		const forbiddenPut = await bobContext.request.put(`/api/journal/${day}?id=${id}`, {
			data: { text: 'piraté', mood: null }
		});
		expect(forbiddenPut.status()).toBe(403);
		expect(await forbiddenPut.json()).toHaveProperty('message');

		const forbiddenDelete = await bobContext.request.delete(`/api/journal/${day}?id=${id}`);
		expect(forbiddenDelete.status()).toBe(403);

		await bob.reload();
		await expect(partner).toContainText(text);
	} finally {
		await bobContext.close();
	}
});

test('tomorrow page is read-only (EC-8)', async ({ page }) => {
	await page.goto(`/journal/${parisTomorrow()}`);
	await expect(page.getByText("Impossible d'écrire pour un jour futur")).toBeVisible();
	await expect(page.locator('textarea')).toHaveCount(0);

	await page.goto(`/journal/${parisToday()}`);
	await expect(page.getByRole('link', { name: /Jour suivant/ })).toHaveCount(0);
});

test('alice deletes her own entry via the UI (FR-15)', async ({ page }) => {
	const day = DAYS.delete;
	const put = await page.request.put(`/api/journal/${day}`, { data: { text: 'à supprimer' } });
	expect(put.status()).toBe(200);

	await page.goto(`/journal/${day}`);
	await expect(page.locator('textarea')).toHaveValue('à supprimer');
	await page.getByRole('button', { name: 'Supprimer' }).click();
	await page.getByRole('button', { name: 'Confirmer' }).click();
	await expect(page.locator('textarea')).toHaveValue('');
	await expect(page.getByRole('button', { name: 'Supprimer' })).toHaveCount(0);
});

test('unsaved draft is restored after reload (EC-13)', async ({ page }) => {
	const text = uniqueTitle('Brouillon');

	await page.goto(`/journal/${DAYS.draft}`);
	await page.getByLabel(/Ce que j'ai vécu/).fill(text);
	await expect
		.poll(() =>
			page.evaluate(() => Object.keys(localStorage).some((k) => k.startsWith('journal-draft:')))
		)
		.toBe(true);

	await page.reload();
	await expect(page.getByLabel(/Ce que j'ai vécu/)).toHaveValue(text);
	await expect(page.getByText('Brouillon non enregistré restauré.')).toBeVisible();

	await page.evaluate(() => localStorage.clear());
});

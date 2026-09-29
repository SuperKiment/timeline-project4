import path from 'node:path';
import { expect, test } from '@playwright/test';
import { ALICE, BOB, login } from './helpers';

/**
 * Desktop and mobile projects run in parallel on the same DB, and
 * journal-calendar.spec.ts asserts bob has NO entry today: bob never writes
 * for today and alice never deletes her today entry here. Every test uses
 * past days that are distinct per project (offset +1 for mobile).
 */
const OFFSETS = { write: 10, delete: 30, draft: 20, media: 40, empty: 60 } as const;

function pastDay(kind: keyof typeof OFFSETS, projectName: string): string {
	const offset = OFFSETS[kind] + (projectName === 'mobile' ? 1 : 0);
	const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date());
	const d = new Date(`${today}T00:00:00Z`);
	d.setUTCDate(d.getUTCDate() - offset);
	return d.toISOString().slice(0, 10);
}

test('alice writes, bob sees it read-only and cannot modify it via API (AC-6, FR-16, EC-7)', async ({
	page,
	browser,
	baseURL
}, testInfo) => {
	const day = pastDay('write', testInfo.project.name);
	const text = `Texte d'alice ${Date.now()}`;

	await login(page, ALICE);
	await page.goto(`/journal/${day}`);
	await page.getByLabel(/Ce que j'ai vécu/).fill(text);
	await page.getByLabel('Joyeux').check();
	await page.getByRole('button', { name: 'Enregistrer' }).click();
	await expect(page.getByText('Enregistré.')).toBeVisible();

	// Same text again: upsert returns the entry id.
	const put = await page.request.put(`/api/journal/${day}`, { data: { text, mood: '😄' } });
	expect(put.status()).toBe(200);
	const { id } = (await put.json()) as { id: number };

	const bobContext = await browser.newContext({ baseURL });
	try {
		const bob = await bobContext.newPage();
		await login(bob, BOB);
		await bob.goto(`/journal/${day}`);

		const partner = bob.getByRole('region', { name: "Journal de l'autre" });
		await expect(partner).toContainText(text);
		await expect(partner.locator('textarea, input, button')).toHaveCount(0);
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

test('PUT for tomorrow is rejected and the page is read-only (EC-8)', async ({ page }) => {
	const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date());
	const d = new Date(`${today}T00:00:00Z`);
	d.setUTCDate(d.getUTCDate() + 1);
	const tomorrow = d.toISOString().slice(0, 10);

	await login(page, ALICE);
	const res = await page.request.put(`/api/journal/${tomorrow}`, {
		data: { text: 'demain', mood: null }
	});
	expect(res.status()).toBe(400);

	await page.goto(`/journal/${tomorrow}`);
	await expect(page.getByText("Impossible d'écrire pour un jour futur")).toBeVisible();
	await expect(page.locator('textarea')).toHaveCount(0);

	await page.goto(`/journal/${today}`);
	await expect(page.getByRole('link', { name: /Jour suivant/ })).toHaveCount(0);
});

test('alice deletes her own entry via the UI (FR-15)', async ({ page }, testInfo) => {
	const day = pastDay('delete', testInfo.project.name);
	await login(page, ALICE);
	const put = await page.request.put(`/api/journal/${day}`, { data: { text: 'à supprimer' } });
	expect(put.status()).toBe(200);

	await page.goto(`/journal/${day}`);
	await expect(page.locator('textarea')).toHaveValue('à supprimer');
	await page.getByRole('button', { name: 'Supprimer' }).click();
	await page.getByRole('button', { name: 'Confirmer' }).click();
	await expect(page.locator('textarea')).toHaveValue('');
	await expect(page.getByRole('button', { name: 'Supprimer' })).toHaveCount(0);
});

test('unsaved draft is restored after reload (EC-13)', async ({ page }, testInfo) => {
	const day = pastDay('draft', testInfo.project.name);
	const text = `Brouillon ${Date.now()}`;

	await login(page, ALICE);
	await page.goto(`/journal/${day}`);
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

test('alice uploads a photo on her entry; bob sees it without a delete button', async ({
	page,
	browser,
	baseURL
}, testInfo) => {
	const day = pastDay('media', testInfo.project.name);
	await login(page, ALICE);
	const put = await page.request.put(`/api/journal/${day}`, { data: { text: 'avec photo' } });
	expect(put.status()).toBe(200);

	await page.goto(`/journal/${day}`);
	await page
		.getByLabel('Ajouter des photos ou vidéos')
		.setInputFiles(path.join('tests', 'fixtures', 'photo-exif-rotated.jpg'));
	const own = page.getByRole('region', { name: 'Mon journal' });
	await expect(own.getByRole('button', { name: 'Agrandir la photo' }).first()).toBeVisible();

	const bobContext = await browser.newContext({ baseURL });
	try {
		const bob = await bobContext.newPage();
		await login(bob, BOB);
		await bob.goto(`/journal/${day}`);
		const partner = bob.getByRole('region', { name: "Journal de l'autre" });
		await expect(partner.getByRole('button', { name: 'Agrandir la photo' }).first()).toBeVisible();
		await expect(partner.getByRole('button', { name: 'Supprimer' })).toHaveCount(0);
	} finally {
		await bobContext.close();
	}
});

test.describe('API failure paths', () => {
	test('unauthenticated PUT and DELETE are rejected with 401', async ({
		browser,
		baseURL
	}, testInfo) => {
		const day = pastDay('empty', testInfo.project.name);
		const context = await browser.newContext({ baseURL, storageState: undefined });
		try {
			const put = await context.request.put(`/api/journal/${day}`, { data: { text: 'x' } });
			expect(put.status()).toBe(401);
			expect(await put.json()).toHaveProperty('message');
			const del = await context.request.delete(`/api/journal/${day}`);
			expect(del.status()).toBe(401);
		} finally {
			await context.close();
		}
	});

	test('invalid requests are rejected with 400/404 and a message', async ({ page }, testInfo) => {
		const day = pastDay('empty', testInfo.project.name);
		await login(page, ALICE);

		const malformed = await page.request.put(`/api/journal/${day}`, {
			headers: { 'content-type': 'application/json' },
			data: Buffer.from('{pas du json')
		});
		expect(malformed.status()).toBe(400);
		expect(await malformed.json()).toEqual({ message: 'Corps de requête invalide.' });

		const badText = await page.request.put(`/api/journal/${day}`, { data: { text: 42 } });
		expect(badText.status()).toBe(400);
		expect(await badText.json()).toHaveProperty('message');

		const badId = await page.request.put(`/api/journal/${day}?id=abc`, { data: { text: 'x' } });
		expect(badId.status()).toBe(400);
		expect(await badId.json()).toEqual({ message: 'Identifiant invalide.' });

		const badDate = await page.request.put('/api/journal/2026-02-30', { data: { text: 'x' } });
		expect(badDate.status()).toBe(400);
		expect(await badDate.json()).toHaveProperty('message');

		const noEntry = await page.request.delete(`/api/journal/${day}`);
		expect(noEntry.status()).toBe(404);
		expect(await noEntry.json()).toEqual({ message: 'Entrée de journal introuvable.' });
	});
});

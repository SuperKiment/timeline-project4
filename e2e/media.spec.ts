import { expect, test } from '@playwright/test';
import { ALICE, login } from './helpers';

const FIXTURES = ['photo-exif-rotated.jpg', 'photo.heic', 'video.mp4'].map(
	(name) => `tests/fixtures/${name}`
);

test('uploads photos and a video on an entry, serves ranges, deletes the entry (FR-24)', async ({
	page
}, testInfo) => {
	test.skip(testInfo.project.name !== 'mobile', 'media upload runs on the mobile project only');

	await login(page, ALICE);
	await page.goto('/entries/new?date=2024-05-01');
	await page.getByLabel('Titre').fill(`Médias ${testInfo.project.name} ${Date.now()}`);
	await page.getByRole('button', { name: 'Créer' }).click();
	await expect(page).toHaveURL(/\/entries\/\d+$/);
	const detailPath = new URL(page.url()).pathname;

	await page.locator('input[type="file"]').setInputFiles(FIXTURES);

	const gallery = page.getByRole('region', { name: 'Médias' });
	await expect(gallery.locator('ul.grid > li')).toHaveCount(3, { timeout: 60_000 });
	await expect(gallery.getByRole('button', { name: 'Agrandir la photo' })).toHaveCount(2);
	await expect(gallery.locator('video')).toHaveCount(1);
	await expect(gallery.locator('video')).toHaveAttribute('poster', /^\/media\/\d+\//);

	// Both photo thumbnails actually decode (HEIC converted). The EXIF fixture is a 60x40
	// landscape with Orientation=6, so its auto-oriented thumbnail must be portrait.
	const thumbs = gallery.locator('button.thumb img');
	const sizes = () =>
		thumbs.evaluateAll((els) =>
			(els as HTMLImageElement[]).map((el) => ({ w: el.naturalWidth, h: el.naturalHeight }))
		);
	await expect.poll(async () => (await sizes()).every(({ w, h }) => w > 0 && h > 0)).toBe(true);
	expect((await sizes()).some(({ w, h }) => h > w)).toBe(true);

	// Range request on the original photo (uses the page's authenticated session).
	const src = await thumbs.first().getAttribute('src');
	const id = src?.match(/^\/media\/(\d+)\//)?.[1];
	expect(id).toBeTruthy();
	const ranged = await page.request.get(`/media/${id}/original`, {
		headers: { Range: 'bytes=0-99' }
	});
	expect(ranged.status()).toBe(206);
	expect((await ranged.body()).length).toBe(100);

	// Deleting the entry moves it out of the detail page.
	await page.locator('form.actions').getByRole('button', { name: 'Supprimer' }).click();
	await page.getByRole('button', { name: 'Confirmer' }).click();
	await expect(page).toHaveURL('/');
	expect((await page.goto(detailPath))?.status()).toBe(404);
});

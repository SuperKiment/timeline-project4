import { expect, test } from '@playwright/test';
import { ALICE_STATE, createEntry, uniqueTitle } from './helpers';

const FIXTURES = ['photo-exif-rotated.jpg', 'photo.heic', 'video.mp4'].map(
	(name) => `tests/fixtures/${name}`
);

test.use({ storageState: ALICE_STATE });

test('uploads photos and a video on an entry and serves ranges (FR-24)', async ({ page }) => {
	await createEntry(page, { title: uniqueTitle('Médias') });

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

	// The viewer loads the WebP display variant, not the original.
	await gallery.getByRole('button', { name: 'Agrandir la photo' }).first().click();
	const viewed = page.locator('dialog.viewer img');
	await expect(viewed).toHaveAttribute('src', `/media/${id}/display`);
	await expect
		.poll(() => viewed.evaluate((el: HTMLImageElement) => (el.complete ? el.naturalWidth : 0)))
		.toBeGreaterThan(0);
	expect(await viewed.evaluate((el: HTMLImageElement) => el.currentSrc)).toMatch(
		/\/media\/\d+\/(display|thumb)$/
	);
});

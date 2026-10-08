import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import sharp from 'sharp';
import type { SniffResult } from './validate';

const FIXTURES = path.resolve(__dirname, '../../../../tests/fixtures');

const JPEG_SNIFF: SniffResult = { mime: 'image/jpeg', kind: 'photo', ext: 'jpg' };
const PNG_SNIFF: SniffResult = { mime: 'image/png', kind: 'photo', ext: 'png' };
const HEIC_SNIFF: SniffResult = { mime: 'image/heic', kind: 'photo', ext: 'heic' };

const ENV_KEYS = ['DATA_DIR'] as const;
const savedEnv: Record<string, string | undefined> = {};
for (const key of ENV_KEYS) {
	savedEnv[key] = process.env[key];
}

let dataDir: string;

beforeEach(async () => {
	dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'timeline-media-test-'));
	process.env.DATA_DIR = dataDir;
});

afterEach(async () => {
	for (const key of ENV_KEYS) {
		if (savedEnv[key] === undefined) {
			delete process.env[key];
		} else {
			process.env[key] = savedEnv[key];
		}
	}
	await fs.rm(dataDir, { recursive: true, force: true });
});

describe('sniffAndValidate', () => {
	it('accepts a real JPEG named with a jpg extension', async () => {
		const { sniffAndValidate } = await import('./validate');
		const result = await sniffAndValidate(
			path.join(FIXTURES, 'photo-exif-rotated.jpg'),
			'vacances.jpg'
		);
		expect(result).toEqual({ mime: 'image/jpeg', kind: 'photo', ext: 'jpg' });
	});

	it('rejects a text file disguised with a jpg extension (EC-9)', async () => {
		const { sniffAndValidate, MediaError } = await import('./validate');
		await expect(sniffAndValidate(path.join(FIXTURES, 'fake.jpg'), 'fake.jpg')).rejects.toThrow(
			MediaError
		);
	});

	it('rejects an unsupported extension', async () => {
		const { sniffAndValidate, MediaError } = await import('./validate');
		await expect(
			sniffAndValidate(path.join(FIXTURES, 'photo-exif-rotated.jpg'), 'document.pdf')
		).rejects.toThrow(MediaError);
	});

	it('rejects an inherited-property extension like x.constructor as unsupported', async () => {
		const { sniffAndValidate } = await import('./validate');
		await expect(
			sniffAndValidate(path.join(FIXTURES, 'photo-exif-rotated.jpg'), 'x.constructor')
		).rejects.toMatchObject({ status: 415 });
	});

	it('accepts a real HEIC file named with a heic extension', async () => {
		const { sniffAndValidate } = await import('./validate');
		const result = await sniffAndValidate(path.join(FIXTURES, 'photo.heic'), 'IMG_0001.heic');
		expect(result.kind).toBe('photo');
		expect(['image/heic', 'image/heif']).toContain(result.mime);
	});

	it('rejects real PNG content renamed with a mismatching jpg extension (EC-9)', async () => {
		const { sniffAndValidate, MediaError } = await import('./validate');
		const pngBuffer = await sharp({
			create: { width: 4, height: 4, channels: 3, background: { r: 0, g: 0, b: 0 } }
		})
			.png()
			.toBuffer();
		const disguised = path.join(dataDir, 'disguised.jpg');
		await fs.writeFile(disguised, pngBuffer);

		await expect(sniffAndValidate(disguised, 'disguised.jpg')).rejects.toThrow(MediaError);
	});
});

describe('storage', () => {
	it('newStoredName never reuses the client file name', async () => {
		const { newStoredName } = await import('./storage');
		const name = newStoredName('jpg');
		expect(name).toMatch(/^[0-9a-f]{32}\.jpg$/);
	});

	it('mediaPath resolves a plain name inside mediaDir', async () => {
		const { mediaPath } = await import('./storage');
		const { getConfig } = await import('../config');
		expect(mediaPath('abc.jpg')).toBe(path.join(getConfig().mediaDir, 'abc.jpg'));
	});

	it('mediaPath throws on path traversal attempts (NFR-4)', async () => {
		const { mediaPath } = await import('./storage');
		expect(() => mediaPath('../x')).toThrow();
		expect(() => mediaPath('../../etc/passwd')).toThrow();
		expect(() => mediaPath('sub/../../x')).toThrow();
	});

	it('mediaPath rejects names resolving to mediaDir itself', async () => {
		const { mediaPath } = await import('./storage');
		expect(() => mediaPath('')).toThrow();
		expect(() => mediaPath('.')).toThrow();
	});

	it('removeMediaFiles ignores already-missing files', async () => {
		const { removeMediaFiles, ensureMediaDir, mediaPath } = await import('./storage');
		await ensureMediaDir();
		await expect(
			removeMediaFiles({ storedName: 'missing.jpg', thumbName: 'missing-thumb.webp' })
		).resolves.toBeUndefined();
		await expect(fs.access(mediaPath('missing.jpg'))).rejects.toThrow();
	});

	it('derivedName derives variant names from the stored name', async () => {
		const { derivedName } = await import('./storage');
		expect(derivedName('ab12.jpg', 'display')).toBe('ab12-display.webp');
		expect(derivedName('ab12.png', 'thumb-sm')).toBe('ab12-thumb-sm.webp');
	});

	it('removeMediaFiles also deletes the derived variants', async () => {
		const { removeMediaFiles, ensureMediaDir, mediaPath } = await import('./storage');
		const { getConfig } = await import('../config');
		await ensureMediaDir();
		const names = ['a.jpg', 't.webp', 'a-display.webp', 'a-thumb-sm.webp'];
		for (const name of names) await fs.writeFile(mediaPath(name), 'x');

		await removeMediaFiles({ storedName: 'a.jpg', thumbName: 't.webp' });

		expect(await fs.readdir(getConfig().mediaDir)).toEqual([]);
	});
});

describe('processPhoto', () => {
	it('applies EXIF auto-orientation, swapping dimensions, and writes a thumbnail', async () => {
		const { processPhoto } = await import('./images');
		const { mediaPath } = await import('./storage');

		const result = await processPhoto(path.join(FIXTURES, 'photo-exif-rotated.jpg'), JPEG_SNIFF);

		expect(result.mime).toBe('image/jpeg');
		// Raw pixels are 60x40 (landscape); EXIF orientation=6 means the correctly
		// oriented image is 40x60 (portrait).
		expect(result.width).toBe(40);
		expect(result.height).toBe(60);

		const originalMeta = await sharp(mediaPath(result.storedName)).metadata();
		expect(originalMeta.width).toBe(40);
		expect(originalMeta.height).toBe(60);
		// Orientation has been baked in and stripped, not left for the browser to reapply.
		expect(originalMeta.orientation ?? 1).toBe(1);

		const thumbMeta = await sharp(mediaPath(result.thumbName)).metadata();
		expect(thumbMeta.format).toBe('webp');
		expect(thumbMeta.width).toBe(40);
		expect(thumbMeta.height).toBe(60);

		// Derived variants are oriented too, and never enlarged.
		const { derivedName } = await import('./storage');
		for (const variant of ['display', 'thumb-sm'] as const) {
			const meta = await sharp(mediaPath(derivedName(result.storedName, variant))).metadata();
			expect(meta.format).toBe('webp');
			expect([meta.width, meta.height]).toEqual([40, 60]);
		}
	});

	it('caps the display variant at 2048px and crops thumb-sm to a 168px square', async () => {
		const { processPhoto } = await import('./images');
		const { derivedName, mediaPath } = await import('./storage');
		const source = path.join(dataDir, 'portrait.png');
		await sharp({ create: { width: 2000, height: 3000, channels: 3, background: '#468' } })
			.png()
			.toFile(source);

		const result = await processPhoto(source, PNG_SNIFF);

		const display = await sharp(mediaPath(derivedName(result.storedName, 'display'))).metadata();
		expect([display.width, display.height]).toEqual([1365, 2048]);
		const small = await sharp(mediaPath(derivedName(result.storedName, 'thumb-sm'))).metadata();
		expect([small.width, small.height]).toEqual([168, 168]);
	});

	it('converts HEIC input to a JPEG original (EC-10 happy path)', async () => {
		const { processPhoto } = await import('./images');
		const { mediaPath } = await import('./storage');

		const result = await processPhoto(path.join(FIXTURES, 'photo.heic'), HEIC_SNIFF);

		expect(result.mime).toBe('image/jpeg');
		expect(result.storedName).toMatch(/\.jpg$/);
		expect(result.width).toBeGreaterThan(0);
		expect(result.height).toBeGreaterThan(0);

		const originalMeta = await sharp(mediaPath(result.storedName)).metadata();
		expect(originalMeta.format).toBe('jpeg');
		expect([originalMeta.width, originalMeta.height]).toEqual([60, 40]);
		expect(originalMeta.channels).toBe(3);

		const { derivedName } = await import('./storage');
		const display = await sharp(mediaPath(derivedName(result.storedName, 'display'))).metadata();
		expect(display.format).toBe('webp');
		expect(display.hasAlpha).toBe(false);
	});

	it('throws a clear MediaError when the HEIC file is not decodable (EC-10)', async () => {
		const { processPhoto } = await import('./images');
		const { MediaError } = await import('./validate');

		await expect(processPhoto(path.join(FIXTURES, 'fake.jpg'), HEIC_SNIFF)).rejects.toThrow(
			MediaError
		);
		await expect(processPhoto(path.join(FIXTURES, 'fake.jpg'), HEIC_SNIFF)).rejects.toThrow(
			/HEIC illisible/
		);
	});

	it('rejects a HEIC reporting more than 50 megapixels before decoding it (EC-9)', async () => {
		// No HEIC encoder is available to build a real oversized fixture, so only
		// the libheif metadata read is stubbed (10000x6000 = 60 MP); the limit
		// check in processPhoto runs for real.
		const decodeHeic = vi.fn();
		vi.resetModules();
		vi.doMock('sharp', () => ({
			default: () => ({ metadata: async () => ({ format: 'heif', width: 10000, height: 6000 }) })
		}));
		vi.doMock('./heic', () => ({ decodeHeic }));
		try {
			const { processPhoto } = await import('./images');
			const { MediaError } = await import('./validate');
			const fixture = path.join(FIXTURES, 'photo.heic');

			await expect(processPhoto(fixture, HEIC_SNIFF)).rejects.toThrow(MediaError);
			await expect(processPhoto(fixture, HEIC_SNIFF)).rejects.toThrow(/Image trop grande/);
			expect(decodeHeic).not.toHaveBeenCalled();
		} finally {
			vi.doUnmock('sharp');
			vi.doUnmock('./heic');
			vi.resetModules();
		}
	});

	it('rejects an oversized non-HEIC image with "Image trop grande"', async () => {
		const { processPhoto } = await import('./images');
		const bigPath = path.join(dataDir, 'big.png');
		const buf = await sharp({
			create: { width: 8000, height: 7000, channels: 3, background: '#000' }
		})
			.png()
			.toBuffer();
		await fs.writeFile(bigPath, buf);

		await expect(processPhoto(bigPath, PNG_SNIFF)).rejects.toThrow(/Image trop grande/);
	});

	it('throws MediaError on a truncated JPEG instead of crashing (EC-9)', async () => {
		const { processPhoto } = await import('./images');
		const { MediaError } = await import('./validate');
		const { ensureMediaDir } = await import('./storage');
		const { getConfig } = await import('../config');

		const original = await fs.readFile(path.join(FIXTURES, 'photo-exif-rotated.jpg'));
		const truncated = original.subarray(0, Math.floor(original.length / 3));
		const truncatedPath = path.join(dataDir, 'truncated.jpg');
		await fs.writeFile(truncatedPath, truncated);

		await expect(processPhoto(truncatedPath, JPEG_SNIFF)).rejects.toThrow(MediaError);
		await expect(processPhoto(truncatedPath, JPEG_SNIFF)).rejects.toThrow(/Image illisible/);

		// Nothing decodable was ever produced, so any partial writes must have
		// been cleaned up: mediaDir stays empty (EC-9).
		await ensureMediaDir();
		const entries = await fs.readdir(getConfig().mediaDir);
		expect(entries).toEqual([]);
	});

	it('rejects a zero-byte file without crashing', async () => {
		const { processPhoto } = await import('./images');
		const { MediaError } = await import('./validate');

		const emptyPath = path.join(dataDir, 'empty.jpg');
		await fs.writeFile(emptyPath, Buffer.alloc(0));

		await expect(processPhoto(emptyPath, PNG_SNIFF)).rejects.toThrow(MediaError);
	});

	it('rejects a photo over MAX_PHOTO_BYTES before reading it, writing nothing', async () => {
		const { processPhoto, MAX_PHOTO_BYTES } = await import('./images');
		const { MediaError } = await import('./validate');
		const { ensureMediaDir } = await import('./storage');
		const { getConfig } = await import('../config');

		// Sparse file: no real 50 MB on disk.
		const bigPath = path.join(dataDir, 'big.jpg');
		await fs.writeFile(bigPath, Buffer.alloc(0));
		await fs.truncate(bigPath, MAX_PHOTO_BYTES + 1);

		const readSpy = vi.spyOn(fs, 'readFile');
		try {
			for (const sniff of [JPEG_SNIFF, HEIC_SNIFF]) {
				await expect(processPhoto(bigPath, sniff)).rejects.toThrow(MediaError);
				await expect(processPhoto(bigPath, sniff)).rejects.toThrow(/Photo trop volumineuse/);
				await expect(processPhoto(bigPath, sniff)).rejects.toMatchObject({ status: 413 });
			}
			expect(readSpy).not.toHaveBeenCalled();
		} finally {
			readSpy.mockRestore();
		}

		await ensureMediaDir();
		expect(await fs.readdir(getConfig().mediaDir)).toEqual([]);
	});

	it('propagates a disk write failure unchanged instead of reporting "Image illisible." (F4, EC-12)', async () => {
		const { processPhoto } = await import('./images');
		const { MediaError } = await import('./validate');
		const { promises: fsPromises } = await import('node:fs');

		// Mirrors the libvips/ENOSPC quirk from F4: a plain `Error`, no `code`
		// property, message "No space left on device". Even in that shape it
		// must never be mistaken for a source decode failure: the caller (T19)
		// needs to tell it apart to return 507.
		const diskFullError = new Error('No space left on device');
		const writeSpy = vi.spyOn(fsPromises, 'writeFile').mockRejectedValueOnce(diskFullError);

		try {
			const promise = processPhoto(path.join(FIXTURES, 'photo-exif-rotated.jpg'), JPEG_SNIFF);
			await expect(promise).rejects.toBe(diskFullError);
			await expect(promise).rejects.not.toBeInstanceOf(MediaError);
		} finally {
			writeSpy.mockRestore();
		}
	});
});

describe('generateMissingVariants', () => {
	it('writes only the missing derived variants and is idempotent', async () => {
		const { generateMissingVariants, processPhoto } = await import('./images');
		const { derivedName, mediaPath } = await import('./storage');
		const result = await processPhoto(path.join(FIXTURES, 'photo-exif-rotated.jpg'), JPEG_SNIFF);
		const displayPath = mediaPath(derivedName(result.storedName, 'display'));
		const smallPath = mediaPath(derivedName(result.storedName, 'thumb-sm'));
		await fs.unlink(smallPath);
		const displayBefore = await fs.stat(displayPath);

		expect(await generateMissingVariants(result.storedName)).toEqual(['thumb-sm']);
		const meta = await sharp(smallPath).metadata();
		expect([meta.format, meta.width, meta.height]).toEqual(['webp', 40, 60]);
		expect((await fs.stat(displayPath)).mtimeMs).toBe(displayBefore.mtimeMs);

		expect(await generateMissingVariants(result.storedName)).toEqual([]);
	});
});

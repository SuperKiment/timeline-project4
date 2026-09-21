import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
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
});

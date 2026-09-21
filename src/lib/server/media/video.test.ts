import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { hasFfmpeg, makePoster } from './video';

const fixtureVideo = path.join(__dirname, '..', '..', '..', '..', 'tests', 'fixtures', 'video.mp4');

// Computed at module load (top-level await) so `it.skipIf` below sees the
// resolved value at test-collection time, before any hook would run.
const hasFf = await hasFfmpeg();

let tmpDir: string;

beforeEach(() => {
	tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'video-test-'));
});

afterEach(() => {
	fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe('hasFfmpeg', () => {
	it('returns false without throwing when the binary does not exist', async () => {
		await expect(hasFfmpeg('ffmpeg-absent')).resolves.toBe(false);
	});
});

describe('makePoster', () => {
	it('returns false without throwing when ffmpeg is missing (EC-11)', async () => {
		const outPath = path.join(tmpDir, 'poster.jpg');

		await expect(makePoster(fixtureVideo, outPath, 'ffmpeg-absent')).resolves.toBe(false);
		expect(fs.existsSync(outPath)).toBe(false);
	});

	it.skipIf(!hasFf)('extracts a poster frame when ffmpeg is available', async () => {
		const outPath = path.join(tmpDir, 'poster.jpg');
		const ok = await makePoster(fixtureVideo, outPath);

		expect(ok).toBe(true);
		expect(fs.existsSync(outPath)).toBe(true);
		expect(fs.statSync(outPath).size).toBeGreaterThan(0);
	});
});

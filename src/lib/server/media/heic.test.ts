import { promises as fs } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { decodeHeic } from './heic';

const FIXTURES = path.resolve(__dirname, '../../../../tests/fixtures');

describe('decodeHeic', () => {
	it('decodes a HEIC file to raw RGBA in a worker thread', async () => {
		const decoded = await decodeHeic(await fs.readFile(path.join(FIXTURES, 'photo.heic')));

		expect([decoded.width, decoded.height]).toEqual([60, 40]);
		expect(decoded.data.length).toBe(60 * 40 * 4);
	});

	it('rejects a file that is not HEIC', async () => {
		await expect(decodeHeic(await fs.readFile(path.join(FIXTURES, 'fake.jpg')))).rejects.toThrow();
	});
});

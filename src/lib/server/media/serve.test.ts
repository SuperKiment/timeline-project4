import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createTestDb } from '../db/test-db';
import { entries, journalEntries, media, occurrenceNotes, users } from '../db/schema';

const now = Date.now();
const ENV_KEYS = ['DATA_DIR'] as const;
const savedEnv: Record<string, string | undefined> = {};
for (const key of ENV_KEYS) {
	savedEnv[key] = process.env[key];
}

let dataDir: string;

beforeEach(async () => {
	dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'timeline-serve-test-'));
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

type TestDb = ReturnType<typeof createTestDb>;

function insertEntry(db: TestDb, deletedAt: number | null = null) {
	return db
		.insert(entries)
		.values({
			type: 'souvenir',
			title: 'Voyage',
			startSort: '2020-01-01',
			startPrecision: 'day',
			createdAt: now,
			updatedAt: now,
			deletedAt
		})
		.returning({ id: entries.id })
		.get().id;
}

async function insertMediaFile(name: string, content: Buffer): Promise<void> {
	const mediaDir = path.join(dataDir, 'media');
	await fs.mkdir(mediaDir, { recursive: true });
	await fs.writeFile(path.join(mediaDir, name), content);
}

function insertMediaRow(
	db: TestDb,
	owner: { entryId?: number; occurrenceNoteId?: number; journalEntryId?: number },
	overrides: Partial<{
		storedName: string;
		thumbName: string | null;
		posterName: string | null;
		kind: 'photo' | 'video';
		mime: string;
		size: number;
		deletedAt: number | null;
	}> = {}
) {
	return db
		.insert(media)
		.values({
			entryId: owner.entryId ?? null,
			occurrenceNoteId: owner.occurrenceNoteId ?? null,
			journalEntryId: owner.journalEntryId ?? null,
			kind: overrides.kind ?? 'photo',
			mime: overrides.mime ?? 'image/jpeg',
			storedName: overrides.storedName ?? 'original.jpg',
			thumbName: overrides.thumbName ?? null,
			posterName: overrides.posterName ?? null,
			size: overrides.size ?? 500,
			originalName: 'photo.jpg',
			createdAt: now,
			deletedAt: overrides.deletedAt ?? null
		})
		.returning({ id: media.id })
		.get().id;
}

describe('serveMedia', () => {
	it('serves a byte range with 206 and the exact requested length', async () => {
		const { serveMedia } = await import('./serve');
		const db = createTestDb();
		const entryId = insertEntry(db);
		const content = Buffer.alloc(500, 'x');
		await insertMediaFile('original.jpg', content);
		const id = insertMediaRow(db, { entryId }, { size: content.length });

		const res = await serveMedia(db, id, 'original', 'bytes=0-99');

		expect(res.status).toBe(206);
		expect(res.headers.get('Content-Length')).toBe('100');
		expect(res.headers.get('Content-Range')).toBe('bytes 0-99/500');
		expect(res.headers.get('Accept-Ranges')).toBe('bytes');
		expect(res.headers.get('Cache-Control')).toBe('private, max-age=31536000, immutable');
		expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
		const body = Buffer.from(await res.arrayBuffer());
		expect(body.length).toBe(100);
		expect(body).toEqual(content.subarray(0, 100));
	});

	it('serves a suffix range (bytes=-n)', async () => {
		const { serveMedia } = await import('./serve');
		const db = createTestDb();
		const entryId = insertEntry(db);
		const content = Buffer.from('0123456789');
		await insertMediaFile('original.jpg', content);
		const id = insertMediaRow(db, { entryId }, { size: content.length });

		const res = await serveMedia(db, id, 'original', 'bytes=-3');

		expect(res.status).toBe(206);
		expect(res.headers.get('Content-Range')).toBe('bytes 7-9/10');
		const body = Buffer.from(await res.arrayBuffer());
		expect(body.toString()).toBe('789');
	});

	it('serves an open-ended range (bytes=a-)', async () => {
		const { serveMedia } = await import('./serve');
		const db = createTestDb();
		const entryId = insertEntry(db);
		const content = Buffer.from('0123456789');
		await insertMediaFile('original.jpg', content);
		const id = insertMediaRow(db, { entryId }, { size: content.length });

		const res = await serveMedia(db, id, 'original', 'bytes=7-');

		expect(res.status).toBe(206);
		expect(res.headers.get('Content-Range')).toBe('bytes 7-9/10');
		const body = Buffer.from(await res.arrayBuffer());
		expect(body.toString()).toBe('789');
	});

	it('returns 200 with the full body when no Range header is sent', async () => {
		const { serveMedia } = await import('./serve');
		const db = createTestDb();
		const entryId = insertEntry(db);
		const content = Buffer.alloc(500, 'y');
		await insertMediaFile('original.jpg', content);
		const id = insertMediaRow(db, { entryId }, { size: content.length });

		const res = await serveMedia(db, id, 'original', null);

		expect(res.status).toBe(200);
		expect(res.headers.get('Content-Length')).toBe('500');
		expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
		const body = Buffer.from(await res.arrayBuffer());
		expect(body).toEqual(content);
	});

	it('ignores a syntactically invalid range (first-byte-pos > last-byte-pos) and serves 200', async () => {
		const { serveMedia } = await import('./serve');
		const db = createTestDb();
		const entryId = insertEntry(db);
		const content = Buffer.alloc(500, 'w');
		await insertMediaFile('original.jpg', content);
		const id = insertMediaRow(db, { entryId }, { size: content.length });

		const res = await serveMedia(db, id, 'original', 'bytes=10-5');

		expect(res.status).toBe(200);
		expect(res.headers.get('Content-Length')).toBe('500');
		expect(res.headers.get('Content-Range')).toBeNull();
		const body = Buffer.from(await res.arrayBuffer());
		expect(body).toEqual(content);
	});

	it('returns 416 for a range past the end of the file', async () => {
		const { serveMedia } = await import('./serve');
		const db = createTestDb();
		const entryId = insertEntry(db);
		const content = Buffer.alloc(500, 'z');
		await insertMediaFile('original.jpg', content);
		const id = insertMediaRow(db, { entryId }, { size: content.length });

		const res = await serveMedia(db, id, 'original', 'bytes=1000-2000');

		expect(res.status).toBe(416);
		expect(res.headers.get('Content-Range')).toBe('bytes */500');
	});

	it('returns 404 for a media row that does not exist', async () => {
		const { serveMedia } = await import('./serve');
		const db = createTestDb();

		const res = await serveMedia(db, 999, 'original', null);

		expect(res.status).toBe(404);
	});

	it('returns 404 for a soft-deleted media row', async () => {
		const { serveMedia } = await import('./serve');
		const db = createTestDb();
		const entryId = insertEntry(db);
		await insertMediaFile('original.jpg', Buffer.from('abc'));
		const id = insertMediaRow(db, { entryId }, { deletedAt: now });

		const res = await serveMedia(db, id, 'original', null);

		expect(res.status).toBe(404);
	});

	it('returns 404 when the owning entry is soft-deleted (EC-16)', async () => {
		const { serveMedia } = await import('./serve');
		const db = createTestDb();
		const entryId = insertEntry(db, now);
		await insertMediaFile('original.jpg', Buffer.from('abc'));
		const id = insertMediaRow(db, { entryId });

		const res = await serveMedia(db, id, 'original', null);

		expect(res.status).toBe(404);
	});

	it('returns 404 when the occurrence note owner is soft-deleted', async () => {
		const { serveMedia } = await import('./serve');
		const db = createTestDb();
		const seriesId = insertEntry(db);
		const noteId = db
			.insert(occurrenceNotes)
			.values({
				seriesId,
				occurrenceDate: '2020-01-01',
				createdAt: now,
				updatedAt: now,
				deletedAt: now
			})
			.returning({ id: occurrenceNotes.id })
			.get().id;
		await insertMediaFile('original.jpg', Buffer.from('abc'));
		const id = insertMediaRow(db, { occurrenceNoteId: noteId });

		const res = await serveMedia(db, id, 'original', null);

		expect(res.status).toBe(404);
	});

	it('returns 404 when the series entry behind an occurrence note is soft-deleted', async () => {
		const { serveMedia } = await import('./serve');
		const db = createTestDb();
		const seriesId = insertEntry(db, now);
		const noteId = db
			.insert(occurrenceNotes)
			.values({ seriesId, occurrenceDate: '2020-01-01', createdAt: now, updatedAt: now })
			.returning({ id: occurrenceNotes.id })
			.get().id;
		await insertMediaFile('original.jpg', Buffer.from('abc'));
		const id = insertMediaRow(db, { occurrenceNoteId: noteId });

		const res = await serveMedia(db, id, 'original', null);

		expect(res.status).toBe(404);
	});

	it('returns 404 when the owning journal entry is soft-deleted', async () => {
		const { serveMedia } = await import('./serve');
		const db = createTestDb();
		const userId = db
			.insert(users)
			.values({
				username: 'alice',
				displayName: 'Alice',
				passwordHash: 'x',
				createdAt: now
			})
			.returning({ id: users.id })
			.get().id;
		const journalId = db
			.insert(journalEntries)
			.values({ userId, day: '2020-01-01', createdAt: now, updatedAt: now, deletedAt: now })
			.returning({ id: journalEntries.id })
			.get().id;
		await insertMediaFile('original.jpg', Buffer.from('abc'));
		const id = insertMediaRow(db, { journalEntryId: journalId });

		const res = await serveMedia(db, id, 'original', null);

		expect(res.status).toBe(404);
	});

	it('serves the thumb variant with an image/webp content type', async () => {
		const { serveMedia } = await import('./serve');
		const db = createTestDb();
		const entryId = insertEntry(db);
		await insertMediaFile('original.jpg', Buffer.from('abc'));
		await insertMediaFile('thumb.webp', Buffer.from('thumb-bytes'));
		const id = insertMediaRow(db, { entryId }, { thumbName: 'thumb.webp' });

		const res = await serveMedia(db, id, 'thumb', null);

		expect(res.status).toBe(200);
		expect(res.headers.get('Content-Type')).toBe('image/webp');
	});

	it('returns 404 for a variant the row does not have (e.g. thumb on a video without one)', async () => {
		const { serveMedia } = await import('./serve');
		const db = createTestDb();
		const entryId = insertEntry(db);
		await insertMediaFile('original.mp4', Buffer.from('abc'));
		const id = insertMediaRow(
			db,
			{ entryId },
			{ storedName: 'original.mp4', kind: 'video', mime: 'video/mp4' }
		);

		const res = await serveMedia(db, id, 'thumb', null);

		expect(res.status).toBe(404);
	});

	it('returns 404 when the row references a file missing from disk', async () => {
		const { serveMedia } = await import('./serve');
		const db = createTestDb();
		const entryId = insertEntry(db);
		const id = insertMediaRow(db, { entryId }, { storedName: 'missing.jpg' });

		const res = await serveMedia(db, id, 'original', null);

		expect(res.status).toBe(404);
	});
});

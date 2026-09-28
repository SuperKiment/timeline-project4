import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { createTestDb } from '../db/test-db';
import type { Db } from '../db';
import { entries, journalEntries, media, occurrenceNotes, users } from '../db/schema';
import { HttpError } from '../http-error';
import { deleteMedia, handleUpload, setMaxBytesForTests } from './upload';
import { hasFfmpeg } from './video';

const FIXTURES = path.resolve(__dirname, '../../../../tests/fixtures');

// 2024-06-15 12:00 UTC is 2024-06-15 in Europe/Paris (default TZ).
const NOW = new Date('2024-06-15T12:00:00Z').getTime();
const TODAY = '2024-06-15';

const hasFf = await hasFfmpeg();

function insertUser(db: Db, suffix: string): number {
	return db
		.insert(users)
		.values({
			username: `user-${suffix}-${Math.random().toString(36).slice(2)}`,
			displayName: `Test ${suffix}`,
			passwordHash: 'x',
			createdAt: NOW
		})
		.returning({ id: users.id })
		.get().id;
}

function insertEntry(db: Db, opts: { deleted?: boolean } = {}): number {
	return db
		.insert(entries)
		.values({
			type: 'souvenir',
			title: 'Vacances',
			startSort: '2024-05-01',
			startPrecision: 'day',
			createdAt: NOW,
			updatedAt: NOW,
			deletedAt: opts.deleted ? NOW : null
		})
		.returning({ id: entries.id })
		.get().id;
}

function insertSeries(db: Db, originIso: string, freq: 'yearly' | 'monthly' = 'yearly'): number {
	return db
		.insert(entries)
		.values({
			type: 'recurrent',
			title: 'Anniversaire',
			startSort: originIso,
			startPrecision: 'day',
			recurrenceFreq: freq,
			createdAt: NOW,
			updatedAt: NOW
		})
		.returning({ id: entries.id })
		.get().id;
}

function insertJournalEntry(db: Db, userId: number, day = '2024-06-01'): number {
	return db
		.insert(journalEntries)
		.values({ userId, day, text: '', createdAt: NOW, updatedAt: NOW })
		.returning({ id: journalEntries.id })
		.get().id;
}

interface MultipartFile {
	filename: string;
	contentType: string;
	data: Buffer;
}

/** Builds a `multipart/form-data` POST `Request` from plain fields plus an optional single file. */
function buildUploadRequest(fields: Record<string, string>, file: MultipartFile | null): Request {
	const boundary = `----timeline-test-${Math.random().toString(16).slice(2)}`;
	const parts: Buffer[] = [];
	for (const [name, value] of Object.entries(fields)) {
		parts.push(
			Buffer.from(
				`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`
			)
		);
	}
	if (file) {
		parts.push(
			Buffer.from(
				`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${file.filename}"\r\n` +
					`Content-Type: ${file.contentType}\r\n\r\n`
			)
		);
		parts.push(file.data);
		parts.push(Buffer.from('\r\n'));
	}
	parts.push(Buffer.from(`--${boundary}--\r\n`));

	return new Request('http://localhost/api/media', {
		method: 'POST',
		headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
		body: Buffer.concat(parts)
	});
}

/** Like `buildUploadRequest` but with any number of file parts. */
function buildMultiPartRequest(fields: Record<string, string>, files: MultipartFile[]): Request {
	const boundary = `----timeline-test-${Math.random().toString(16).slice(2)}`;
	const parts: Buffer[] = [];
	for (const [name, value] of Object.entries(fields)) {
		parts.push(
			Buffer.from(
				`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`
			)
		);
	}
	for (const file of files) {
		parts.push(
			Buffer.from(
				`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${file.filename}"\r\n` +
					`Content-Type: ${file.contentType}\r\n\r\n`
			)
		);
		parts.push(file.data);
		parts.push(Buffer.from('\r\n'));
	}
	parts.push(Buffer.from(`--${boundary}--\r\n`));

	return new Request('http://localhost/api/media', {
		method: 'POST',
		headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
		body: Buffer.concat(parts)
	});
}

/** A request whose body stream errors out immediately, simulating a client abort. */
function buildAbortedRequest(): Request {
	const boundary = `----timeline-test-${Math.random().toString(16).slice(2)}`;
	const stream = new ReadableStream<Uint8Array>({
		start(controller) {
			controller.error(new Error('client aborted'));
		}
	});
	return new Request('http://localhost/api/media', {
		method: 'POST',
		headers: { 'content-type': `multipart/form-data; boundary=${boundary}` },
		body: stream,
		duplex: 'half'
	} as RequestInit & { duplex: 'half' });
}

const ENV_KEYS = ['DATA_DIR'] as const;
const savedEnv: Record<string, string | undefined> = {};
for (const key of ENV_KEYS) {
	savedEnv[key] = process.env[key];
}

let dataDir: string;
let db: Db;

beforeEach(async () => {
	dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'timeline-upload-test-'));
	process.env.DATA_DIR = dataDir;
	db = createTestDb();
});

afterEach(async () => {
	for (const key of ENV_KEYS) {
		if (savedEnv[key] === undefined) {
			delete process.env[key];
		} else {
			process.env[key] = savedEnv[key];
		}
	}
	setMaxBytesForTests(null);
	await fs.rm(dataDir, { recursive: true, force: true });
});

async function tmpDirEntries(): Promise<string[]> {
	const { getConfig } = await import('../config');
	await fs.mkdir(getConfig().tmpDir, { recursive: true });
	return fs.readdir(getConfig().tmpDir);
}

async function mediaDirEntries(): Promise<string[]> {
	const { ensureMediaDir } = await import('./storage');
	const { getConfig } = await import('../config');
	await ensureMediaDir();
	return fs.readdir(getConfig().mediaDir);
}

describe('handleUpload', () => {
	it('stores a JPEG attached to an entry and returns its row (FR-21, AC-7)', async () => {
		const userId = insertUser(db, 'a');
		const entryId = insertEntry(db);
		const data = await fs.readFile(path.join(FIXTURES, 'photo-exif-rotated.jpg'));

		const response = await handleUpload(
			db,
			buildUploadRequest(
				{ ownerKind: 'entry', ownerId: String(entryId) },
				{ filename: 'vacances.jpg', contentType: 'image/jpeg', data }
			),
			{ id: userId },
			NOW
		);

		expect(response.status).toBe(200);
		const body = (await response.json()) as {
			id: number;
			kind: string;
			thumbUrl: string;
			url: string;
		}[];
		expect(body).toHaveLength(1);
		expect(body[0].kind).toBe('photo');
		expect(body[0].url).toBe(`/media/${body[0].id}/original`);
		expect(body[0].thumbUrl).toBe(`/media/${body[0].id}/thumb`);

		const row = db.select().from(media).where(eq(media.id, body[0].id)).get();
		expect(row?.entryId).toBe(entryId);
		expect(row?.mime).toBe('image/jpeg');
		expect(row?.thumbName).toBeTruthy();

		const { mediaPath } = await import('./storage');
		await expect(fs.access(mediaPath(row!.storedName))).resolves.toBeUndefined();
		await expect(fs.access(mediaPath(row!.thumbName!))).resolves.toBeUndefined();
		expect(await tmpDirEntries()).toEqual([]);
	});

	it('rejects content that does not match its extension with 415 and leaves no file/row (EC-9)', async () => {
		const userId = insertUser(db, 'a');
		const entryId = insertEntry(db);
		const data = await fs.readFile(path.join(FIXTURES, 'fake.jpg'));

		const response = await handleUpload(
			db,
			buildUploadRequest(
				{ ownerKind: 'entry', ownerId: String(entryId) },
				{ filename: 'fake.jpg', contentType: 'image/jpeg', data }
			),
			{ id: userId },
			NOW
		);

		expect(response.status).toBe(415);
		expect(db.select().from(media).all()).toEqual([]);
		expect(await tmpDirEntries()).toEqual([]);
		expect(await mediaDirEntries()).toEqual([]);
	});

	it('accepts a file of exactly the size cap (inclusive limit)', async () => {
		const userId = insertUser(db, 'a');
		const entryId = insertEntry(db);
		const data = await fs.readFile(path.join(FIXTURES, 'photo-exif-rotated.jpg'));
		setMaxBytesForTests(data.byteLength);

		const response = await handleUpload(
			db,
			buildUploadRequest(
				{ ownerKind: 'entry', ownerId: String(entryId) },
				{ filename: 'vacances.jpg', contentType: 'image/jpeg', data }
			),
			{ id: userId },
			NOW
		);

		expect(response.status).not.toBe(413);
		expect(response.status).toBe(200);
	});

	it('rejects an oversized file with 413 and empties the tmp dir (EC-9)', async () => {
		setMaxBytesForTests(500);
		const userId = insertUser(db, 'a');
		const entryId = insertEntry(db);
		const data = await fs.readFile(path.join(FIXTURES, 'photo-exif-rotated.jpg'));
		expect(data.byteLength).toBeGreaterThan(500);

		const response = await handleUpload(
			db,
			buildUploadRequest(
				{ ownerKind: 'entry', ownerId: String(entryId) },
				{ filename: 'vacances.jpg', contentType: 'image/jpeg', data }
			),
			{ id: userId },
			NOW
		);

		expect(response.status).toBe(413);
		expect(db.select().from(media).all()).toEqual([]);
		expect(await tmpDirEntries()).toEqual([]);
	});

	it('aborts on an oversized first file even when more parts follow (413, tmp empty)', async () => {
		setMaxBytesForTests(500);
		const userId = insertUser(db, 'a');
		const entryId = insertEntry(db);
		const big = { filename: 'big.bin', contentType: 'image/jpeg', data: Buffer.alloc(5000, 1) };
		const small = { filename: 'small.bin', contentType: 'image/jpeg', data: Buffer.alloc(100, 2) };

		const response = await handleUpload(
			db,
			buildMultiPartRequest({ ownerKind: 'entry', ownerId: String(entryId) }, [
				big,
				small,
				small,
				big
			]),
			{ id: userId },
			NOW
		);

		expect(response.status).toBe(413);
		expect(await response.json()).toEqual({ message: 'Fichier trop volumineux (max 500 Mo)' });
		expect(db.select().from(media).all()).toEqual([]);
		expect(await tmpDirEntries()).toEqual([]);
	});

	it('rejects files that are each under the cap but exceed it together (413, tmp empty)', async () => {
		setMaxBytesForTests(500);
		const userId = insertUser(db, 'a');
		const entryId = insertEntry(db);
		const part = { filename: 'part.bin', contentType: 'image/jpeg', data: Buffer.alloc(300, 1) };

		const response = await handleUpload(
			db,
			buildMultiPartRequest({ ownerKind: 'entry', ownerId: String(entryId) }, [part, part]),
			{ id: userId },
			NOW
		);

		expect(response.status).toBe(413);
		expect(db.select().from(media).all()).toEqual([]);
		expect(await tmpDirEntries()).toEqual([]);
	});

	it('rejects more than 20 files with 413 and empties the tmp dir', async () => {
		const userId = insertUser(db, 'a');
		const entryId = insertEntry(db);
		const data = await fs.readFile(path.join(FIXTURES, 'photo-exif-rotated.jpg'));

		const response = await handleUpload(
			db,
			buildMultiPartRequest(
				{ ownerKind: 'entry', ownerId: String(entryId) },
				Array.from({ length: 21 }, (_, i) => ({
					filename: `p${i}.jpg`,
					contentType: 'image/jpeg',
					data
				}))
			),
			{ id: userId },
			NOW
		);

		expect(response.status).toBe(413);
		expect(db.select().from(media).all()).toEqual([]);
		expect(await tmpDirEntries()).toEqual([]);
		expect(await mediaDirEntries()).toEqual([]);
	});

	it('rejects more than 20 non-file fields with 413', async () => {
		const userId = insertUser(db, 'a');
		const entryId = insertEntry(db);
		const data = await fs.readFile(path.join(FIXTURES, 'photo-exif-rotated.jpg'));
		const fields: Record<string, string> = { ownerKind: 'entry', ownerId: String(entryId) };
		for (let i = 0; i < 25; i++) fields[`extra${i}`] = 'x';

		const response = await handleUpload(
			db,
			buildUploadRequest(fields, { filename: 'vacances.jpg', contentType: 'image/jpeg', data }),
			{ id: userId },
			NOW
		);

		expect(response.status).toBe(413);
		expect(db.select().from(media).all()).toEqual([]);
		expect(await tmpDirEntries()).toEqual([]);
	});

	it('rejects an oversized field value with 413', async () => {
		const userId = insertUser(db, 'a');
		const entryId = insertEntry(db);
		const data = await fs.readFile(path.join(FIXTURES, 'photo-exif-rotated.jpg'));

		const response = await handleUpload(
			db,
			buildUploadRequest(
				{ ownerKind: 'entry', ownerId: String(entryId), note: 'x'.repeat(64 * 1024 + 1) },
				{ filename: 'vacances.jpg', contentType: 'image/jpeg', data }
			),
			{ id: userId },
			NOW
		);

		expect(response.status).toBe(413);
		expect(db.select().from(media).all()).toEqual([]);
		expect(await tmpDirEntries()).toEqual([]);
	});

	it('leaves no row behind when the request body is aborted mid-stream', async () => {
		const userId = insertUser(db, 'a');

		const response = await handleUpload(db, buildAbortedRequest(), { id: userId }, NOW);

		expect(response.status).not.toBe(200);
		expect(db.select().from(media).all()).toEqual([]);
		expect(await tmpDirEntries()).toEqual([]);
	});

	it("rejects uploading to another user's journal entry with 403", async () => {
		const owner = insertUser(db, 'owner');
		const other = insertUser(db, 'other');
		const journalId = insertJournalEntry(db, owner);
		const data = await fs.readFile(path.join(FIXTURES, 'photo-exif-rotated.jpg'));

		const response = await handleUpload(
			db,
			buildUploadRequest(
				{ ownerKind: 'journal', ownerId: String(journalId) },
				{ filename: 'vacances.jpg', contentType: 'image/jpeg', data }
			),
			{ id: other },
			NOW
		);

		expect(response.status).toBe(403);
		expect(db.select().from(media).all()).toEqual([]);
		expect(await tmpDirEntries()).toEqual([]);
	});

	it('accepts uploading to your own journal entry', async () => {
		const userId = insertUser(db, 'a');
		const journalId = insertJournalEntry(db, userId);
		const data = await fs.readFile(path.join(FIXTURES, 'photo-exif-rotated.jpg'));

		const response = await handleUpload(
			db,
			buildUploadRequest(
				{ ownerKind: 'journal', ownerId: String(journalId) },
				{ filename: 'vacances.jpg', contentType: 'image/jpeg', data }
			),
			{ id: userId },
			NOW
		);

		expect(response.status).toBe(200);
		const row = db.select().from(media).where(eq(media.journalEntryId, journalId)).get();
		expect(row).toBeTruthy();
	});

	it('reports a disk-full write failure as 507 instead of a generic error, with no orphan row (EC-12, F4)', async () => {
		const userId = insertUser(db, 'a');
		const entryId = insertEntry(db);
		const data = await fs.readFile(path.join(FIXTURES, 'photo-exif-rotated.jpg'));

		const enospc = Object.assign(new Error('ENOSPC: no space left on device, write'), {
			code: 'ENOSPC'
		});
		const writeSpy = vi.spyOn(fs, 'writeFile').mockRejectedValueOnce(enospc);

		try {
			const response = await handleUpload(
				db,
				buildUploadRequest(
					{ ownerKind: 'entry', ownerId: String(entryId) },
					{ filename: 'vacances.jpg', contentType: 'image/jpeg', data }
				),
				{ id: userId },
				NOW
			);

			expect(response.status).toBe(507);
			expect(db.select().from(media).all()).toEqual([]);
			expect(await mediaDirEntries()).toEqual([]);
		} finally {
			writeSpy.mockRestore();
		}
	});

	it('removes already-written photo files when the row insert fails (EC-9)', async () => {
		const userId = insertUser(db, 'a');
		const entryId = insertEntry(db);
		const data = await fs.readFile(path.join(FIXTURES, 'photo-exif-rotated.jpg'));
		db.run(sql`CREATE TRIGGER fail_media_insert BEFORE INSERT ON media
			BEGIN SELECT RAISE(ABORT, 'insert failed'); END`);

		const response = await handleUpload(
			db,
			buildUploadRequest(
				{ ownerKind: 'entry', ownerId: String(entryId) },
				{ filename: 'vacances.jpg', contentType: 'image/jpeg', data }
			),
			{ id: userId },
			NOW
		);

		expect(response.status).toBeGreaterThanOrEqual(400);
		expect(db.select().from(media).all()).toEqual([]);
		expect(await mediaDirEntries()).toEqual([]);
		expect(await tmpDirEntries()).toEqual([]);
	});

	it('removes the moved video and poster when the row insert fails (EC-9)', async () => {
		const userId = insertUser(db, 'a');
		const entryId = insertEntry(db);
		const data = await fs.readFile(path.join(FIXTURES, 'video.mp4'));
		db.run(sql`CREATE TRIGGER fail_media_insert BEFORE INSERT ON media
			BEGIN SELECT RAISE(ABORT, 'insert failed'); END`);

		const response = await handleUpload(
			db,
			buildUploadRequest(
				{ ownerKind: 'entry', ownerId: String(entryId) },
				{ filename: 'clip.mp4', contentType: 'video/mp4', data }
			),
			{ id: userId },
			NOW
		);

		expect(response.status).toBeGreaterThanOrEqual(400);
		expect(db.select().from(media).all()).toEqual([]);
		expect(await mediaDirEntries()).toEqual([]);
		expect(await tmpDirEntries()).toEqual([]);
	});

	it('attaches a photo to a recurrent series occurrence, creating its note (FR-21)', async () => {
		const userId = insertUser(db, 'a');
		const seriesId = insertSeries(db, '2020-06-15');
		const data = await fs.readFile(path.join(FIXTURES, 'photo-exif-rotated.jpg'));

		const response = await handleUpload(
			db,
			buildUploadRequest(
				{ ownerKind: 'occurrence', seriesId: String(seriesId), date: TODAY },
				{ filename: 'vacances.jpg', contentType: 'image/jpeg', data }
			),
			{ id: userId },
			NOW
		);

		expect(response.status).toBe(200);
		const note = db
			.select()
			.from(occurrenceNotes)
			.where(eq(occurrenceNotes.seriesId, seriesId))
			.get();
		expect(note).toBeTruthy();
		const row = db.select().from(media).where(eq(media.occurrenceNoteId, note!.id)).get();
		expect(row).toBeTruthy();
	});

	it('propagates ensureOccurrenceNote HttpError status (404 for an unknown series)', async () => {
		const userId = insertUser(db, 'a');
		const data = await fs.readFile(path.join(FIXTURES, 'photo-exif-rotated.jpg'));

		const response = await handleUpload(
			db,
			buildUploadRequest(
				{ ownerKind: 'occurrence', seriesId: '999999', date: TODAY },
				{ filename: 'vacances.jpg', contentType: 'image/jpeg', data }
			),
			{ id: userId },
			NOW
		);

		expect(response.status).toBe(404);
		expect(db.select().from(media).all()).toEqual([]);
		expect(await tmpDirEntries()).toEqual([]);
	});

	it('moves a video into mediaDir and best-effort generates a poster (T18)', async () => {
		const userId = insertUser(db, 'a');
		const entryId = insertEntry(db);
		const data = await fs.readFile(path.join(FIXTURES, 'video.mp4'));

		const response = await handleUpload(
			db,
			buildUploadRequest(
				{ ownerKind: 'entry', ownerId: String(entryId) },
				{ filename: 'clip.mp4', contentType: 'video/mp4', data }
			),
			{ id: userId },
			NOW
		);

		expect(response.status).toBe(200);
		const body = (await response.json()) as { id: number; kind: string }[];
		expect(body[0].kind).toBe('video');

		const row = db.select().from(media).where(eq(media.id, body[0].id)).get();
		expect(row?.kind).toBe('video');
		expect(row?.thumbName).toBeNull();

		const { mediaPath } = await import('./storage');
		await expect(fs.access(mediaPath(row!.storedName))).resolves.toBeUndefined();

		if (hasFf) {
			expect(row?.posterName).not.toBeNull();
			await expect(fs.access(mediaPath(row!.posterName!))).resolves.toBeUndefined();
		} else {
			expect(row?.posterName).toBeNull();
		}
	});
});

describe('deleteMedia', () => {
	it('soft-deletes a media row', () => {
		const userId = insertUser(db, 'a');
		const entryId = insertEntry(db);
		const row = db
			.insert(media)
			.values({
				entryId,
				kind: 'photo',
				mime: 'image/jpeg',
				storedName: 'a.jpg',
				thumbName: 'a-thumb.webp',
				size: 10,
				originalName: 'a.jpg',
				createdBy: userId,
				createdAt: NOW
			})
			.returning({ id: media.id })
			.get();

		deleteMedia(db, row.id, userId, NOW + 1000);

		const updated = db.select().from(media).where(eq(media.id, row.id)).get();
		expect(updated?.deletedAt).toBe(NOW + 1000);
	});

	it("refuses to delete another user's journal media (403)", () => {
		const owner = insertUser(db, 'owner');
		const other = insertUser(db, 'other');
		const journalId = insertJournalEntry(db, owner);
		const row = db
			.insert(media)
			.values({
				journalEntryId: journalId,
				kind: 'photo',
				mime: 'image/jpeg',
				storedName: 'a.jpg',
				thumbName: 'a-thumb.webp',
				size: 10,
				originalName: 'a.jpg',
				createdBy: owner,
				createdAt: NOW
			})
			.returning({ id: media.id })
			.get();

		expect.assertions(2);
		try {
			deleteMedia(db, row.id, other, NOW + 1000);
		} catch (err) {
			expect(err).toBeInstanceOf(HttpError);
			expect((err as HttpError).status).toBe(403);
		}
	});
});

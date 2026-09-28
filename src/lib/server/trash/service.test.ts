import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '../db';
import { entries, journalEntries, media, occurrenceNotes, sessions, users } from '../db/schema';
import { createTestDb } from '../db/test-db';
import { HttpError } from '../http-error';
import { listTrash, purgeExpired, purgeItem, restore, TRASH_RETENTION_MS } from './service';

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-06-15T12:00:00Z').getTime();

let dataDir: string;
let db: Db;
let savedDataDir: string | undefined;

beforeEach(async () => {
	savedDataDir = process.env.DATA_DIR;
	dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'timeline-trash-test-'));
	process.env.DATA_DIR = dataDir;
	await fs.mkdir(path.join(dataDir, 'media'), { recursive: true });
	db = createTestDb();
});

afterEach(async () => {
	if (savedDataDir === undefined) delete process.env.DATA_DIR;
	else process.env.DATA_DIR = savedDataDir;
	await fs.rm(dataDir, { recursive: true, force: true });
});

function insertUser(name: string): number {
	return db
		.insert(users)
		.values({ username: name, displayName: name, passwordHash: 'h', createdAt: NOW })
		.returning({ id: users.id })
		.get().id;
}

function insertEntry(
	opts: { deletedAt?: number | null; recurrent?: boolean; title?: string } = {}
) {
	return db
		.insert(entries)
		.values({
			type: opts.recurrent ? 'recurrent' : 'souvenir',
			recurrenceFreq: opts.recurrent ? 'yearly' : null,
			title: opts.title ?? 'Vacances',
			startSort: '2024-05-01',
			startPrecision: 'day',
			createdAt: NOW,
			updatedAt: NOW,
			deletedAt: opts.deletedAt ?? null
		})
		.returning({ id: entries.id })
		.get().id;
}

function insertNote(seriesId: number, date: string, deletedAt: number | null = null): number {
	return db
		.insert(occurrenceNotes)
		.values({
			seriesId,
			occurrenceDate: date,
			note: 'n',
			createdAt: NOW,
			updatedAt: NOW,
			deletedAt
		})
		.returning({ id: occurrenceNotes.id })
		.get().id;
}

function insertJournal(userId: number, day: string, deletedAt: number | null = null): number {
	return db
		.insert(journalEntries)
		.values({ userId, day, text: 't', createdAt: NOW, updatedAt: NOW, deletedAt })
		.returning({ id: journalEntries.id })
		.get().id;
}

let fileCounter = 0;
async function insertMedia(
	owner: { entryId?: number; occurrenceNoteId?: number; journalEntryId?: number },
	deletedAt: number | null = null
): Promise<{ id: number; files: string[] }> {
	fileCounter += 1;
	const storedName = `file${fileCounter}.jpg`;
	const thumbName = `file${fileCounter}-thumb.jpg`;
	for (const n of [storedName, thumbName]) {
		await fs.writeFile(path.join(dataDir, 'media', n), 'x');
	}
	const id = db
		.insert(media)
		.values({
			...owner,
			kind: 'photo',
			mime: 'image/jpeg',
			storedName,
			thumbName,
			size: 1,
			originalName: `orig${fileCounter}.jpg`,
			createdAt: NOW,
			deletedAt
		})
		.returning({ id: media.id })
		.get().id;
	return { id, files: [storedName, thumbName].map((n) => path.join(dataDir, 'media', n)) };
}

async function exists(file: string): Promise<boolean> {
	return fs.access(file).then(
		() => true,
		() => false
	);
}

describe('listTrash', () => {
	it('lists only top-level deleted items with expiresAt = deletedAt + 30d', async () => {
		const u = insertUser('a');
		const series = insertEntry({ recurrent: true, deletedAt: NOW - DAY, title: 'Série' });
		insertNote(series, '2025-05-01', NOW - DAY); // child of a deleted series
		const noteOnLive = insertNote(
			insertEntry({ recurrent: true, title: 'Vivante' }),
			'2025-05-01',
			NOW - 2 * DAY
		);
		const liveEntry = insertEntry();
		await insertMedia({ entryId: series }, NOW - DAY); // child of deleted entry
		const m = await insertMedia({ entryId: liveEntry }, NOW - 3 * DAY);
		const j = insertJournal(u, '2026-06-01', NOW - 4 * DAY);
		await insertMedia({ journalEntryId: j }, NOW - 4 * DAY); // child of deleted journal
		insertEntry(); // live: not listed

		const items = listTrash(db);
		expect(items.map((i) => `${i.kind}:${i.id}`)).toEqual([
			`entry:${series}`,
			`occurrenceNote:${noteOnLive}`,
			`media:${m.id}`,
			`journal:${j}`
		]);
		const first = items[0];
		expect(first.title).toBe('Série');
		expect(first.deletedAt).toBe(NOW - DAY);
		expect(first.expiresAt).toBe(NOW - DAY + TRASH_RETENTION_MS);
		expect(items[3].ownerId).toBe(u);
	});
});

describe('restore', () => {
	it('restoring a series makes its notes and media visible again (EC-5, AC-8)', async () => {
		const series = insertEntry({ recurrent: true, deletedAt: NOW });
		const note = insertNote(series, '2025-05-01');
		await insertMedia({ occurrenceNoteId: note });
		expect(listTrash(db)).toHaveLength(1);

		restore(db, 'entry', series, 1);

		expect(listTrash(db)).toEqual([]);
		const row = db.select().from(entries).get()!;
		expect(row.deletedAt).toBeNull();
		expect(db.select().from(occurrenceNotes).get()!.deletedAt).toBeNull();
		expect(db.select().from(media).get()!.deletedAt).toBeNull();
	});

	it('restores notes and media individually', async () => {
		const series = insertEntry({ recurrent: true });
		const note = insertNote(series, '2025-05-01', NOW);
		const m = await insertMedia({ entryId: series }, NOW);
		restore(db, 'occurrenceNote', note, 1);
		restore(db, 'media', m.id, 1);
		expect(listTrash(db)).toEqual([]);
	});

	it('404 when the item is missing or not deleted', () => {
		const id = insertEntry();
		expect(() => restore(db, 'entry', id, 1)).toThrow(expect.objectContaining({ status: 404 }));
		expect(() => restore(db, 'entry', 999, 1)).toThrow(HttpError);
	});

	it.each(['__proto__', 'constructor', 'toString', 'nope'])(
		'rejects unknown kind %s with 400',
		async (kind) => {
			const id = insertEntry({ deletedAt: NOW });
			expect(() => restore(db, kind, id, 1)).toThrow(expect.objectContaining({ status: 400 }));
			await expect(purgeItem(db, kind, id, 1)).rejects.toMatchObject({ status: 400 });
			expect(db.select().from(entries).all()).toHaveLength(1);
		}
	);

	it('409 when restoring a note or media whose parent is still deleted', async () => {
		const series = insertEntry({ recurrent: true, deletedAt: NOW });
		const note = insertNote(series, '2025-05-01', NOW);
		const viaNote = await insertMedia({ occurrenceNoteId: note }, NOW);
		const viaEntry = await insertMedia({ entryId: series }, NOW);
		const alice = insertUser('alice');
		const j = insertJournal(alice, '2026-06-01', NOW);
		const viaJournal = await insertMedia({ journalEntryId: j }, NOW);

		expect(() => restore(db, 'occurrenceNote', note, 1)).toThrow(
			expect.objectContaining({ status: 409 })
		);
		for (const m of [viaNote, viaEntry]) {
			expect(() => restore(db, 'media', m.id, alice)).toThrow(
				expect.objectContaining({ status: 409 })
			);
		}
		expect(() => restore(db, 'media', viaJournal.id, alice)).toThrow(
			expect.objectContaining({ status: 409 })
		);
		expect(db.select().from(occurrenceNotes).get()!.deletedAt).toBe(NOW);

		// restoring the parent first, then the child, works
		restore(db, 'entry', series, 1);
		expect(() => restore(db, 'media', viaNote.id, 1)).toThrow(
			expect.objectContaining({ status: 409 })
		);
		restore(db, 'occurrenceNote', note, 1);
		restore(db, 'media', viaNote.id, 1);
		expect(listTrash(db).map((i) => `${i.kind}:${i.id}`)).toEqual(
			expect.arrayContaining([`media:${viaEntry.id}`])
		);
	});

	it('media on a journal entry: only the author may restore (403)', async () => {
		const alice = insertUser('alice');
		const bob = insertUser('bob');
		const j = insertJournal(alice, '2026-06-01');
		const m = await insertMedia({ journalEntryId: j }, NOW);
		expect(() => restore(db, 'media', m.id, bob)).toThrow(expect.objectContaining({ status: 403 }));
		restore(db, 'media', m.id, alice);
		expect(db.select().from(media).get()!.deletedAt).toBeNull();
	});

	it('journal: only the author may restore (403)', () => {
		const alice = insertUser('alice');
		const bob = insertUser('bob');
		const j = insertJournal(alice, '2026-06-01', NOW);
		expect(() => restore(db, 'journal', j, bob)).toThrow(expect.objectContaining({ status: 403 }));
		restore(db, 'journal', j, alice);
		expect(db.select().from(journalEntries).get()!.deletedAt).toBeNull();
	});

	it('journal: 409 with a French message when a live entry exists for that day', () => {
		const alice = insertUser('alice');
		const j = insertJournal(alice, '2026-06-01', NOW);
		insertJournal(alice, '2026-06-01');
		let err: unknown;
		try {
			restore(db, 'journal', j, alice);
		} catch (e) {
			err = e;
		}
		expect(err).toBeInstanceOf(HttpError);
		expect((err as HttpError).status).toBe(409);
		expect((err as HttpError).message).toMatch(/journal/);
		expect(
			db
				.select()
				.from(journalEntries)
				.all()
				.filter((r) => r.deletedAt !== null)
		).toHaveLength(1);
	});
});

describe('purgeItem', () => {
	it('purges a series with notes and media (rows + files)', async () => {
		const series = insertEntry({ recurrent: true, deletedAt: NOW });
		const note = insertNote(series, '2025-05-01');
		const direct = await insertMedia({ entryId: series });
		const viaNote = await insertMedia({ occurrenceNoteId: note });
		const other = await insertMedia({ entryId: insertEntry() });

		await purgeItem(db, 'entry', series, 1);

		expect(db.select().from(occurrenceNotes).all()).toEqual([]);
		expect(
			db
				.select()
				.from(media)
				.all()
				.map((m) => m.id)
		).toEqual([other.id]);
		for (const f of [...direct.files, ...viaNote.files]) expect(await exists(f)).toBe(false);
		for (const f of other.files) expect(await exists(f)).toBe(true);
	});

	it('journal purge is author only and removes its media', async () => {
		const alice = insertUser('alice');
		const bob = insertUser('bob');
		const j = insertJournal(alice, '2026-06-01', NOW);
		const m = await insertMedia({ journalEntryId: j });
		await expect(purgeItem(db, 'journal', j, bob)).rejects.toMatchObject({ status: 403 });
		await purgeItem(db, 'journal', j, alice);
		expect(db.select().from(journalEntries).all()).toEqual([]);
		expect(await exists(m.files[0])).toBe(false);
	});

	it("occurrenceNote purge removes its media files, not the sibling note's", async () => {
		const series = insertEntry({ recurrent: true });
		const note = insertNote(series, '2025-05-01', NOW);
		const sibling = insertNote(series, '2025-05-02');
		const mine = await insertMedia({ occurrenceNoteId: note });
		const theirs = await insertMedia({ occurrenceNoteId: sibling });

		await purgeItem(db, 'occurrenceNote', note, 1);

		expect(
			db
				.select()
				.from(occurrenceNotes)
				.all()
				.map((n) => n.id)
		).toEqual([sibling]);
		expect(
			db
				.select()
				.from(media)
				.all()
				.map((m) => m.id)
		).toEqual([theirs.id]);
		for (const f of mine.files) expect(await exists(f)).toBe(false);
		for (const f of theirs.files) expect(await exists(f)).toBe(true);
	});

	it('media purge removes only that media and its files', async () => {
		const entry = insertEntry();
		const target = await insertMedia({ entryId: entry }, NOW);
		const other = await insertMedia({ entryId: entry });

		await purgeItem(db, 'media', target.id, 1);

		expect(
			db
				.select()
				.from(media)
				.all()
				.map((m) => m.id)
		).toEqual([other.id]);
		expect(db.select().from(entries).all()).toHaveLength(1);
		for (const f of target.files) expect(await exists(f)).toBe(false);
		for (const f of other.files) expect(await exists(f)).toBe(true);
	});

	it('still removes rows when the files are already missing', async () => {
		const series = insertEntry({ deletedAt: NOW });
		const m = await insertMedia({ entryId: series });
		for (const f of m.files) await fs.rm(f);

		await expect(purgeItem(db, 'entry', series, 1)).resolves.toBeUndefined();

		expect(db.select().from(entries).all()).toEqual([]);
		expect(db.select().from(media).all()).toEqual([]);
	});

	it('media on a journal entry: only the author may purge (403)', async () => {
		const alice = insertUser('alice');
		const bob = insertUser('bob');
		const j = insertJournal(alice, '2026-06-01');
		const m = await insertMedia({ journalEntryId: j }, NOW);
		await expect(purgeItem(db, 'media', m.id, bob)).rejects.toMatchObject({ status: 403 });
		expect(db.select().from(media).all()).toHaveLength(1);
		await purgeItem(db, 'media', m.id, alice);
		expect(db.select().from(media).all()).toEqual([]);
	});

	it('refuses a live item (404)', async () => {
		const id = insertEntry();
		await expect(purgeItem(db, 'entry', id, 1)).rejects.toMatchObject({ status: 404 });
	});
});

describe('purgeExpired', () => {
	it('purges items deleted 31 days ago, keeps 29-day ones, drops expired sessions', async () => {
		const u = insertUser('a');
		const old = insertEntry({ deletedAt: NOW - 31 * DAY });
		const oldMedia = await insertMedia({ entryId: old });
		const recent = insertEntry({ deletedAt: NOW - 29 * DAY });
		const recentMedia = await insertMedia({ entryId: recent });
		insertJournal(u, '2026-01-01', NOW - 31 * DAY);
		const oldSeries = insertEntry({ recurrent: true, deletedAt: NOW - 40 * DAY });
		const oldNote = insertNote(oldSeries, '2025-05-01');
		const oldNoteMedia = await insertMedia({ occurrenceNoteId: oldNote });
		db.insert(sessions)
			.values([
				{ id: 'expired', userId: u, expiresAt: NOW - 1 },
				{ id: 'at-now', userId: u, expiresAt: NOW },
				{ id: 'live', userId: u, expiresAt: NOW + DAY }
			])
			.run();

		await purgeExpired(db, NOW);

		expect(
			db
				.select()
				.from(entries)
				.all()
				.map((e) => e.id)
		).toEqual([recent]);
		expect(db.select().from(journalEntries).all()).toEqual([]);
		expect(db.select().from(occurrenceNotes).all()).toEqual([]);
		expect(
			db
				.select()
				.from(media)
				.all()
				.map((m) => m.id)
		).toEqual([recentMedia.id]);
		for (const f of [...oldMedia.files, ...oldNoteMedia.files]) expect(await exists(f)).toBe(false);
		for (const f of recentMedia.files) expect(await exists(f)).toBe(true);
		expect(
			db
				.select()
				.from(sessions)
				.all()
				.map((s) => s.id)
		).toEqual(['live']);
	});

	it('purges strictly before now-30d: the exact boundary is kept', async () => {
		const atBoundary = insertEntry({ deletedAt: NOW - TRASH_RETENTION_MS });
		const justOver = insertEntry({ deletedAt: NOW - TRASH_RETENTION_MS - 1 });

		const purged = await purgeExpired(db, NOW);

		expect(purged).toBe(1);
		expect(
			db
				.select()
				.from(entries)
				.all()
				.map((e) => e.id)
		).toEqual([atBoundary]);
		expect(justOver).not.toBe(atBoundary);
	});

	it('sweeps expired sessions even when the purge fails', async () => {
		const u = insertUser('a');
		db.insert(sessions)
			.values({ id: 'expired', userId: u, expiresAt: NOW - 1 })
			.run();
		const old = insertEntry({ deletedAt: NOW - 31 * DAY });
		// Make the purge transaction fail: a file-removal error is swallowed, so break the DB instead.
		const failing = new Proxy(db, {
			get(target, prop, receiver) {
				if (prop === 'transaction') {
					return () => {
						throw new Error('boom');
					};
				}
				return Reflect.get(target, prop, receiver);
			}
		});

		await expect(purgeExpired(failing, NOW)).rejects.toThrow('boom');

		expect(db.select().from(sessions).all()).toEqual([]);
		expect(
			db
				.select()
				.from(entries)
				.all()
				.map((e) => e.id)
		).toEqual([old]);
	});
});

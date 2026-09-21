import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { eq, sql } from 'drizzle-orm';
import { afterEach, describe, expect, it } from 'vitest';
import { createDb } from './index';
import { runMigrations } from './migrate';
import { createTestDb } from './test-db';
import { entries, media, occurrenceNotes } from './schema';

const now = Date.now();

function insertEntry(db: ReturnType<typeof createTestDb>, title: string) {
	const row = db
		.insert(entries)
		.values({
			type: 'souvenir',
			title,
			startSort: '2020-01-01',
			startPrecision: 'day',
			createdAt: now,
			updatedAt: now
		})
		.returning({ id: entries.id })
		.get();
	return row.id;
}

describe('createTestDb', () => {
	it('runs migrations and enables foreign key enforcement', () => {
		const db = createTestDb();

		const fk = db.get<{ foreign_keys: number }>(sql`PRAGMA foreign_keys`);
		expect(fk.foreign_keys).toBe(1);

		const tables = db.all<{ name: string }>(
			sql`select name from sqlite_master where type = 'table' order by name`
		);
		const tableNames = tables.map((t) => t.name);
		expect(tableNames).toEqual(
			expect.arrayContaining([
				'users',
				'sessions',
				'entries',
				'occurrence_notes',
				'journal_entries',
				'media',
				'entries_fts',
				'journal_fts'
			])
		);
	});
});

describe('createDb', () => {
	let dir: string;

	afterEach(() => {
		if (dir) fs.rmSync(dir, { recursive: true, force: true });
	});

	it('opens a file-based database in WAL journal mode', () => {
		dir = fs.mkdtempSync(path.join(os.tmpdir(), 'timeline-db-test-'));
		const dbPath = path.join(dir, 'timeline.sqlite');

		const db = createDb(dbPath);
		runMigrations(db);

		const mode = db.get<{ journal_mode: string }>(sql`PRAGMA journal_mode`);
		expect(mode.journal_mode).toBe('wal');
		expect(fs.existsSync(dbPath)).toBe(true);
	});
});

describe('entries_fts sync triggers', () => {
	it('indexes a new entry and drops it again on hard delete', () => {
		const db = createTestDb();
		const id = insertEntry(db, 'Voyage a Kyoto');

		const hits = db.all<{ id: number }>(
			sql`select rowid as id from entries_fts where entries_fts match 'Kyoto'`
		);
		expect(hits).toEqual([{ id }]);

		db.delete(entries).where(eq(entries.id, id)).run();

		const afterDelete = db.all<{ id: number }>(
			sql`select rowid as id from entries_fts where entries_fts match 'Kyoto'`
		);
		expect(afterDelete).toEqual([]);
	});
});

describe('media exactly-one-owner CHECK constraint', () => {
	it('rejects a media row with two owners set', () => {
		const db = createTestDb();
		const entryId = insertEntry(db, 'Anniversaire');
		const note = db
			.insert(occurrenceNotes)
			.values({
				seriesId: entryId,
				occurrenceDate: '2020-01-01',
				createdAt: now,
				updatedAt: now
			})
			.returning({ id: occurrenceNotes.id })
			.get();

		expect(() =>
			db
				.insert(media)
				.values({
					entryId,
					occurrenceNoteId: note.id,
					kind: 'photo',
					mime: 'image/jpeg',
					storedName: 'abc.jpg',
					size: 123,
					originalName: 'photo.jpg',
					createdAt: now
				})
				.run()
		).toThrow(/CHECK constraint failed/);
	});

	it('rejects a media row with no owner set', () => {
		const db = createTestDb();

		expect(() =>
			db
				.insert(media)
				.values({
					kind: 'photo',
					mime: 'image/jpeg',
					storedName: 'abc.jpg',
					size: 123,
					originalName: 'photo.jpg',
					createdAt: now
				})
				.run()
		).toThrow(/CHECK constraint failed/);
	});
});

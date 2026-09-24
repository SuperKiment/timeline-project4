import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { entries, journalEntries, users } from '../db/schema';
import { createTestDb } from '../db/test-db';
import { search, toFtsQuery } from './service';

const now = Date.now();

function insertUser(db: ReturnType<typeof createTestDb>, username: string) {
	return db
		.insert(users)
		.values({
			username,
			displayName: username,
			passwordHash: 'hash',
			createdAt: now
		})
		.returning({ id: users.id })
		.get().id;
}

function insertEntry(
	db: ReturnType<typeof createTestDb>,
	fields: { title: string; description?: string; deletedAt?: number | null }
) {
	return db
		.insert(entries)
		.values({
			type: 'souvenir',
			title: fields.title,
			description: fields.description ?? null,
			startSort: '2020-01-01',
			startPrecision: 'day',
			createdAt: now,
			updatedAt: now,
			deletedAt: fields.deletedAt ?? null
		})
		.returning({ id: entries.id })
		.get().id;
}

function insertJournal(
	db: ReturnType<typeof createTestDb>,
	userId: number,
	day: string,
	text: string
) {
	return db
		.insert(journalEntries)
		.values({ userId, day, text, createdAt: now, updatedAt: now })
		.returning({ id: journalEntries.id })
		.get().id;
}

describe('toFtsQuery', () => {
	it('turns tokens into quoted prefix matches joined by space', () => {
		expect(toFtsQuery('bonjour monde')).toBe('"bonjour"* "monde"*');
	});

	it('strips quotes and FTS operator characters from tokens', () => {
		expect(toFtsQuery('a" OR -b*')).toBe('"a"* "OR"* "b"*');
	});

	it('returns null for empty or punctuation-only input', () => {
		expect(toFtsQuery('')).toBeNull();
		expect(toFtsQuery('   ')).toBeNull();
		expect(toFtsQuery('"*-')).toBeNull();
	});
});

describe('search', () => {
	it('finds a word present in one entry description and one journal entry', () => {
		const db = createTestDb();
		const userId = insertUser(db, 'alice');
		insertEntry(db, {
			title: 'Randonnée',
			description: 'Nous avons vu des edelweiss sur le sentier'
		});
		insertJournal(db, userId, '2024-05-01', 'Trouvé un edelweiss séché dans un livre');

		const results = search(db, 'edelweiss');

		expect(results).toHaveLength(2);
		expect(results.map((r) => r.kind).sort()).toEqual(['entry', 'journal']);
	});

	it('does not throw and returns [] on malformed FTS-operator input (EC-15)', () => {
		const db = createTestDb();
		insertEntry(db, { title: 'Test', description: 'alpha beta gamma' });

		expect(() => search(db, '"*-')).not.toThrow();
		expect(search(db, '"*-')).toEqual([]);

		expect(() => search(db, 'a" OR -b*')).not.toThrow();
		expect(search(db, 'a" OR -b*')).toEqual([]);
	});

	it('returns [] for empty query without hitting the database', () => {
		const db = createTestDb();
		expect(search(db, '')).toEqual([]);
	});

	it('excludes soft-deleted entries (EC-16)', () => {
		const db = createTestDb();
		insertEntry(db, {
			title: 'Souvenir supprimé',
			description: 'girafe violette',
			deletedAt: now
		});

		expect(search(db, 'girafe')).toEqual([]);
	});

	it('excludes soft-deleted journal entries', () => {
		const db = createTestDb();
		const userId = insertUser(db, 'bob');
		const journalId = insertJournal(db, userId, '2024-06-01', 'kangourou fluorescent');
		db.update(journalEntries).set({ deletedAt: now }).where(eq(journalEntries.id, journalId)).run();

		expect(search(db, 'kangourou')).toEqual([]);
	});

	it('interleaves per-table bm25 rank instead of comparing raw scores across tables', () => {
		// bm25 scores from entries_fts (4 columns) and journal_fts (1 column) are
		// not comparable, so the merge must interleave each list's own rank
		// order (entry#1, journal#1, entry#2, journal#2, …), not sort by raw
		// bm25. Term frequency drives the per-table bm25 rank here: the entry/
		// journal entry that repeats "sirocco" more often ranks first in its
		// own list.
		const db = createTestDb();
		const userId = insertUser(db, 'carol');
		const entryBestId = insertEntry(db, {
			title: 'Tempête',
			description: 'sirocco sirocco sirocco sur la côte'
		});
		insertEntry(db, { title: 'Vent', description: 'un souffle de sirocco au loin' });
		insertJournal(db, userId, '2024-07-01', 'sirocco sirocco sirocco toute la nuit');
		insertJournal(db, userId, '2024-07-02', 'un peu de sirocco ce matin');

		const results = search(db, 'sirocco');

		expect(results).toHaveLength(4);
		expect(results.map((r) => r.kind)).toEqual(['entry', 'journal', 'entry', 'journal']);
		expect(results[0]).toMatchObject({ kind: 'entry', id: entryBestId });
	});
});

import { describe, expect, it } from 'vitest';
import type { Db } from '../db';
import { createTestDb } from '../db/test-db';
import { entries, journalEntries, occurrenceNotes, users } from '../db/schema';
import { onThisDay } from './service';

const now = Date.now();

function insertUser(db: Db, username: string) {
	return db
		.insert(users)
		.values({
			username,
			displayName: username,
			passwordHash: 'x',
			createdAt: now
		})
		.returning({ id: users.id })
		.get().id;
}

function insertEntry(db: Db, overrides: Partial<typeof entries.$inferInsert> & { title: string }) {
	return db
		.insert(entries)
		.values({
			type: 'souvenir',
			startSort: '2020-01-01',
			startPrecision: 'day',
			createdAt: now,
			updatedAt: now,
			...overrides
		})
		.returning({ id: entries.id })
		.get().id;
}

describe('onThisDay', () => {
	it('groups visible souvenir/important entries on the same day across past years, newest first', () => {
		const db = createTestDb();
		insertEntry(db, { title: 'Anniversaire 2021', type: 'souvenir', startSort: '2021-06-15' });
		insertEntry(db, { title: 'Anniversaire 2019', type: 'important', startSort: '2019-06-15' });
		insertEntry(db, { title: 'Autre jour', type: 'souvenir', startSort: '2020-06-16' });

		const result = onThisDay(db, '2026-06-15');

		expect(result.map((y) => y.year)).toEqual([2021, 2019]);
		expect(result[0].items).toEqual([
			{ kind: 'entry', id: expect.any(Number), type: 'souvenir', title: 'Anniversaire 2021' }
		]);
		expect(result[1].items).toEqual([
			{ kind: 'entry', id: expect.any(Number), type: 'important', title: 'Anniversaire 2019' }
		]);
	});

	it('excludes month-precision entries and soft-deleted entries', () => {
		const db = createTestDb();
		insertEntry(db, {
			title: 'Mois seulement',
			type: 'souvenir',
			startSort: '2021-06-00',
			startPrecision: 'month'
		});
		insertEntry(db, {
			title: 'Supprime',
			type: 'souvenir',
			startSort: '2020-06-15',
			deletedAt: now
		});

		expect(onThisDay(db, '2026-06-15')).toEqual([]);
	});

	it('includes recurrent series occurrences landing on the day, respecting 29/02 -> 28/02', () => {
		const db = createTestDb();
		insertEntry(db, {
			title: 'Fete annuelle',
			type: 'recurrent',
			startSort: '2020-02-29',
			startPrecision: 'day',
			recurrenceFreq: 'yearly'
		});

		const result = onThisDay(db, '2026-02-28');

		expect(result.map((y) => y.year)).toEqual([2025, 2023, 2022, 2021]);
		for (const year of result) {
			expect(year.items).toEqual([
				{
					kind: 'occurrence',
					seriesId: expect.any(Number),
					date: `${year.year}-02-28`,
					title: 'Fete annuelle',
					note: null
				}
			]);
		}
	});

	it('attaches the occurrence note when one exists', () => {
		const db = createTestDb();
		const seriesId = insertEntry(db, {
			title: 'Fete annuelle',
			type: 'recurrent',
			startSort: '2020-06-15',
			startPrecision: 'day',
			recurrenceFreq: 'yearly'
		});
		db.insert(occurrenceNotes)
			.values({
				seriesId,
				occurrenceDate: '2021-06-15',
				note: 'Beau souvenir',
				createdAt: now,
				updatedAt: now
			})
			.run();

		const result = onThisDay(db, '2026-06-15');
		const year2021 = result.find((y) => y.year === 2021);

		expect(year2021?.items).toContainEqual({
			kind: 'occurrence',
			seriesId,
			date: '2021-06-15',
			title: 'Fete annuelle',
			note: 'Beau souvenir'
		});
	});

	it('includes visible journal entries on the same day with an excerpt and author', () => {
		const db = createTestDb();
		const userId = insertUser(db, 'alice');
		db.insert(journalEntries)
			.values({
				userId,
				day: '2022-06-15',
				text: 'Une belle journee.',
				createdAt: now,
				updatedAt: now
			})
			.run();
		db.insert(journalEntries)
			.values({
				userId,
				day: '2022-06-16',
				text: 'Pas le meme jour.',
				createdAt: now,
				updatedAt: now
			})
			.run();

		const result = onThisDay(db, '2026-06-15');

		expect(result).toEqual([
			{
				year: 2022,
				items: [
					{ kind: 'journal', day: '2022-06-15', author: 'alice', excerpt: 'Une belle journee.' }
				]
			}
		]);
	});

	it('truncates long journal excerpts', () => {
		const db = createTestDb();
		const userId = insertUser(db, 'bob');
		const longText = 'a'.repeat(200);
		db.insert(journalEntries)
			.values({ userId, day: '2022-06-15', text: longText, createdAt: now, updatedAt: now })
			.run();

		const result = onThisDay(db, '2026-06-15');

		expect(result[0].items[0]).toMatchObject({ kind: 'journal' });
		const item = result[0].items[0] as { kind: 'journal'; excerpt: string };
		expect(item.excerpt.length).toBe(141);
		expect(item.excerpt.endsWith('…')).toBe(true);
	});

	it('excludes soft-deleted journal entries', () => {
		const db = createTestDb();
		const userId = insertUser(db, 'alice');
		db.insert(journalEntries)
			.values({
				userId,
				day: '2022-06-15',
				text: 'Supprime',
				createdAt: now,
				updatedAt: now,
				deletedAt: now
			})
			.run();

		expect(onThisDay(db, '2026-06-15')).toEqual([]);
	});

	it('returns an empty array when nothing matches', () => {
		const db = createTestDb();
		expect(onThisDay(db, '2026-06-15')).toEqual([]);
	});
});

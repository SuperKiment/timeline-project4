import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { createTestDb } from '../db/test-db';
import type { Db } from '../db';
import { entries, media, occurrenceNotes } from '../db/schema';
import { getTimeline, hasUserContent, isOngoing } from './query';
import type { EntryType } from '../../timeline/types';

const now = Date.now();

interface EntryOverrides {
	type?: EntryType;
	title?: string;
	startSort?: string;
	startPrecision?: 'day' | 'month' | 'year';
	endSort?: string | null;
	endPrecision?: 'day' | 'month' | 'year' | null;
	recurrenceFreq?: 'yearly' | 'monthly' | null;
	deletedAt?: number | null;
	createdAt?: number;
}

function insertEntry(db: Db, overrides: EntryOverrides = {}): number {
	const row = db
		.insert(entries)
		.values({
			type: overrides.type ?? 'souvenir',
			title: overrides.title ?? 'Titre',
			startSort: overrides.startSort ?? '2020-01-01',
			startPrecision: overrides.startPrecision ?? 'day',
			endSort: overrides.endSort ?? null,
			endPrecision: overrides.endPrecision ?? null,
			recurrenceFreq: overrides.recurrenceFreq ?? null,
			createdAt: overrides.createdAt ?? now,
			updatedAt: overrides.createdAt ?? now,
			deletedAt: overrides.deletedAt ?? null
		})
		.returning({ id: entries.id })
		.get();
	return row.id;
}

function insertPhoto(db: Db, owner: { entryId?: number; occurrenceNoteId?: number }): number {
	const row = db
		.insert(media)
		.values({
			entryId: owner.entryId ?? null,
			occurrenceNoteId: owner.occurrenceNoteId ?? null,
			kind: 'photo',
			mime: 'image/jpeg',
			storedName: 'x.jpg',
			size: 1,
			originalName: 'x.jpg',
			createdAt: now
		})
		.returning({ id: media.id })
		.get();
	return row.id;
}

describe('getTimeline', () => {
	it('returns [] when no types are requested', () => {
		const db = createTestDb();
		insertEntry(db);
		expect(getTimeline(db, { types: [], today: '2025-01-01' })).toEqual([]);
	});

	it('orders items by sort key (EC-3: year < month < day precision)', () => {
		const db = createTestDb();
		insertEntry(db, { title: 'jour', startSort: '2018-03-12', startPrecision: 'day' });
		insertEntry(db, { title: 'annee', startSort: '2018-00-00', startPrecision: 'year' });
		insertEntry(db, { title: 'mois', startSort: '2018-03-00', startPrecision: 'month' });

		const result = getTimeline(db, { types: ['souvenir'], today: '2025-01-01' });

		expect(result.map((item) => item.title)).toEqual(['annee', 'mois', 'jour']);
	});

	it('breaks ties by created_at then id', () => {
		const db = createTestDb();
		const second = insertEntry(db, {
			title: 'second',
			startSort: '2020-01-01',
			createdAt: now + 10
		});
		const first = insertEntry(db, {
			title: 'first',
			startSort: '2020-01-01',
			createdAt: now
		});

		const result = getTimeline(db, { types: ['souvenir'], today: '2025-01-01' });

		expect(result.map((item) => item.id)).toEqual([first, second]);
	});

	it('filters by requested types', () => {
		const db = createTestDb();
		insertEntry(db, { type: 'souvenir', title: 'a souvenir' });
		insertEntry(db, { type: 'important', title: 'an important' });

		const result = getTimeline(db, { types: ['important'], today: '2025-01-01' });

		expect(result).toHaveLength(1);
		expect(result[0].type).toBe('important');
	});

	it('excludes soft-deleted entries (EC-16)', () => {
		const db = createTestDb();
		insertEntry(db, { title: 'visible' });
		insertEntry(db, { title: 'deleted', deletedAt: now });

		const result = getTimeline(db, { types: ['souvenir'], today: '2025-01-01' });

		expect(result.map((item) => item.title)).toEqual(['visible']);
	});

	it('marks open phase/histoire as ongoing, and closed ones as not (EC-1)', () => {
		const db = createTestDb();
		insertEntry(db, { type: 'phase', title: 'open phase', endSort: null });
		insertEntry(db, {
			type: 'phase',
			title: 'closed phase',
			endSort: '2020-06-01',
			endPrecision: 'day'
		});
		insertEntry(db, { type: 'histoire', title: 'open histoire', endSort: null });

		const result = getTimeline(db, {
			types: ['phase', 'histoire'],
			today: '2025-01-01'
		});

		const byTitle = new Map(result.map((item) => [item.title, item.ongoing]));
		expect(byTitle.get('open phase')).toBe(true);
		expect(byTitle.get('closed phase')).toBe(false);
		expect(byTitle.get('open histoire')).toBe(true);
	});

	it('expands a recurrent series into occurrence items, never emitting the series row itself', () => {
		const db = createTestDb();
		const seriesId = insertEntry(db, {
			type: 'recurrent',
			title: 'Anniversaire',
			startSort: '2023-06-15',
			startPrecision: 'day',
			recurrenceFreq: 'yearly'
		});

		const result = getTimeline(db, { types: ['recurrent'], today: '2025-06-15' });

		expect(result).toHaveLength(3);
		expect(result.map((item) => item.occurrenceDate)).toEqual([
			'2023-06-15',
			'2024-06-15',
			'2025-06-15'
		]);
		for (const item of result) {
			expect(item.kind).toBe('occurrence');
			expect(item.seriesId).toBe(seriesId);
			expect(item.id).toBe(seriesId);
		}
	});

	it('gives every item a unique key, even across a recurrent series with several occurrences', () => {
		const db = createTestDb();
		insertEntry(db, { title: 'plain a', startSort: '2019-01-01' });
		insertEntry(db, { title: 'plain b', startSort: '2021-01-01' });
		insertEntry(db, {
			type: 'recurrent',
			title: 'Anniversaire',
			startSort: '2023-06-15',
			startPrecision: 'day',
			recurrenceFreq: 'yearly'
		});

		const result = getTimeline(db, { types: ['souvenir', 'recurrent'], today: '2025-06-15' });

		const keys = result.map((item) => item.key);
		expect(new Set(keys).size).toBe(keys.length);
	});

	it('stops recurrent expansion at the series end date when set', () => {
		const db = createTestDb();
		insertEntry(db, {
			type: 'recurrent',
			title: 'Fete',
			startSort: '2023-01-01',
			startPrecision: 'day',
			recurrenceFreq: 'monthly',
			endSort: '2023-03-01',
			endPrecision: 'day'
		});

		const result = getTimeline(db, { types: ['recurrent'], today: '2025-01-01' });

		expect(result.map((item) => item.occurrenceDate)).toEqual([
			'2023-01-01',
			'2023-02-01',
			'2023-03-01'
		]);
	});

	it('sets thumbUrl to the first visible photo of an entry', () => {
		const db = createTestDb();
		const entryId = insertEntry(db, { title: 'avec photo' });
		const firstPhotoId = insertPhoto(db, { entryId });
		insertPhoto(db, { entryId });

		const result = getTimeline(db, { types: ['souvenir'], today: '2025-01-01' });

		expect(result[0].thumbUrl).toBe(`/media/${firstPhotoId}/thumb`);
	});

	it('has no thumbUrl when an entry has no visible photo', () => {
		const db = createTestDb();
		insertEntry(db, { title: 'sans photo' });

		const result = getTimeline(db, { types: ['souvenir'], today: '2025-01-01' });

		expect(result[0].thumbUrl).toBeNull();
	});

	it('sets hasNote and thumbUrl on an occurrence with a note and photo', () => {
		const db = createTestDb();
		const seriesId = insertEntry(db, {
			type: 'recurrent',
			title: 'Serie',
			startSort: '2024-01-01',
			startPrecision: 'day',
			recurrenceFreq: 'yearly'
		});
		const note = db
			.insert(occurrenceNotes)
			.values({
				seriesId,
				occurrenceDate: '2024-01-01',
				note: 'un souvenir',
				createdAt: now,
				updatedAt: now
			})
			.returning({ id: occurrenceNotes.id })
			.get();
		const photoId = insertPhoto(db, { occurrenceNoteId: note.id });

		const result = getTimeline(db, { types: ['recurrent'], today: '2024-01-01' });

		expect(result).toHaveLength(1);
		expect(result[0].hasNote).toBe(true);
		expect(result[0].thumbUrl).toBe(`/media/${photoId}/thumb`);
	});

	it('does not report hasNote for an occurrence whose note is empty or absent', () => {
		const db = createTestDb();
		const seriesId = insertEntry(db, {
			type: 'recurrent',
			title: 'Serie',
			startSort: '2024-01-01',
			startPrecision: 'day',
			recurrenceFreq: 'yearly'
		});
		db.insert(occurrenceNotes)
			.values({
				seriesId,
				occurrenceDate: '2024-01-01',
				note: '   ',
				createdAt: now,
				updatedAt: now
			})
			.run();

		const result = getTimeline(db, { types: ['recurrent'], today: '2024-01-01' });

		expect(result).toHaveLength(1);
		expect(result[0].hasNote).toBe(false);
		expect(result[0].thumbUrl).toBeNull();
	});

	it('returns 2000 entries plus a 10-year monthly series in under 300ms (NFR-2)', () => {
		const db = createTestDb();
		for (let i = 0; i < 2000; i++) {
			insertEntry(db, {
				title: `entry ${i}`,
				startSort: `20${String(10 + (i % 15)).padStart(2, '0')}-${String((i % 12) + 1).padStart(2, '0')}-01`
			});
		}
		insertEntry(db, {
			type: 'recurrent',
			title: 'monthly series',
			startSort: '2015-01-01',
			startPrecision: 'day',
			recurrenceFreq: 'monthly'
		});

		const run = () => {
			const start = performance.now();
			const res = getTimeline(db, {
				types: ['souvenir', 'recurrent'],
				today: '2025-01-01'
			});
			return { res, elapsed: performance.now() - start };
		};
		const result = run().res; // warm-up
		const times = [run(), run(), run()].map((r) => r.elapsed).sort((x, y) => x - y);
		const median = times[1];
		const budget = Number(process.env.PERF_BUDGET_MS ?? (process.env.CI ? 900 : 300));

		expect(result.length).toBeGreaterThan(2000);
		expect(median).toBeLessThan(budget);
	});
});

function insertSeeded(db: Db): void {
	const id = insertEntry(db, { type: 'histoire' });
	db.update(entries)
		.set({ seedKey: `seed-${id}` })
		.where(eq(entries.id, id))
		.run();
}

describe('hasUserContent (EC-14)', () => {
	it('is false on an empty database', () => {
		expect(hasUserContent(createTestDb())).toBe(false);
	});

	it('is false when only seeded entries exist', () => {
		const db = createTestDb();
		insertSeeded(db);
		expect(hasUserContent(db)).toBe(false);
	});

	it('is true for a user-created histoire entry', () => {
		const db = createTestDb();
		insertEntry(db, { type: 'histoire' });
		expect(hasUserContent(db)).toBe(true);
	});

	it('is false when the only user entry is soft-deleted', () => {
		const db = createTestDb();
		insertSeeded(db);
		insertEntry(db, { type: 'souvenir', deletedAt: now });
		expect(hasUserContent(db)).toBe(false);
	});

	it('is true with a live souvenir', () => {
		const db = createTestDb();
		insertEntry(db, { type: 'histoire' });
		insertEntry(db, { type: 'souvenir' });
		expect(hasUserContent(db)).toBe(true);
	});
});

describe('isOngoing', () => {
	it('is true for open phase and histoire', () => {
		expect(isOngoing('phase', null)).toBe(true);
		expect(isOngoing('histoire', null)).toBe(true);
	});

	it('is false when an end date is set', () => {
		expect(isOngoing('phase', '2020-06-01')).toBe(false);
		expect(isOngoing('histoire', '2020-00-00')).toBe(false);
	});

	it('is false for other types even without an end date', () => {
		expect(isOngoing('souvenir', null)).toBe(false);
		expect(isOngoing('important', null)).toBe(false);
		expect(isOngoing('recurrent', null)).toBe(false);
	});
});

describe('getTimeline types subset', () => {
	it('returns only the requested subset of several types', () => {
		const db = createTestDb();
		insertEntry(db, { type: 'souvenir', title: 's' });
		insertEntry(db, { type: 'important', title: 'i' });
		insertEntry(db, { type: 'phase', title: 'p' });

		const result = getTimeline(db, { types: ['souvenir', 'phase'], today: '2025-01-01' });

		expect(result.map((item) => item.title).sort()).toEqual(['p', 's']);
	});
});

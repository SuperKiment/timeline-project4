import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Db } from '../db';
import { createTestDb } from '../db/test-db';
import { entries, media, occurrenceNotes, users } from '../db/schema';
import { HttpError } from '../http-error';
import { ensureOccurrenceNote, listSeriesOccurrences, upsertOccurrenceNote } from './occurrences';

// 2024-06-15 12:00 UTC is 2024-06-15 in Europe/Paris (default TZ), used as "now"
// throughout so occurrence dates on/after that day count as future.
const NOW = new Date('2024-06-15T12:00:00Z').getTime();
const TODAY = '2024-06-15';

function insertSeries(
	db: Db,
	opts: {
		originIso: string;
		freq: 'yearly' | 'monthly';
		endIso?: string | null;
		title?: string;
	}
): number {
	const row = db
		.insert(entries)
		.values({
			type: 'recurrent',
			title: opts.title ?? 'Anniversaire',
			startSort: opts.originIso,
			startPrecision: 'day',
			endSort: opts.endIso ?? null,
			endPrecision: opts.endIso ? 'day' : null,
			recurrenceFreq: opts.freq,
			createdAt: NOW,
			updatedAt: NOW
		})
		.returning({ id: entries.id })
		.get();
	return row.id;
}

function insertUser(db: Db): number {
	const row = db
		.insert(users)
		.values({
			username: `user-${Math.random().toString(36).slice(2)}`,
			displayName: 'Test',
			passwordHash: 'x',
			createdAt: NOW
		})
		.returning({ id: users.id })
		.get();
	return row.id;
}

describe('occurrences service', () => {
	let db: Db;
	let userId: number;

	beforeEach(() => {
		db = createTestDb();
		userId = insertUser(db);
	});

	it('attaches a note only to its own occurrence, others stay note-less', () => {
		const seriesId = insertSeries(db, { originIso: '2020-06-15', freq: 'yearly' });

		upsertOccurrenceNote(db, seriesId, '2022-06-15', 'Bon souvenir', userId, NOW, TODAY);

		const { occurrences, orphans } = listSeriesOccurrences(db, seriesId, TODAY);

		expect(orphans).toEqual([]);
		expect(occurrences.map((o) => o.date)).toEqual([
			'2020-06-15',
			'2021-06-15',
			'2022-06-15',
			'2023-06-15',
			'2024-06-15'
		]);
		const withNote = occurrences.find((o) => o.date === '2022-06-15');
		expect(withNote?.note).toBe('Bon souvenir');
		expect(withNote?.noteId).not.toBeNull();

		for (const o of occurrences.filter((o) => o.date !== '2022-06-15')) {
			expect(o.note).toBeNull();
			expect(o.noteId).toBeNull();
		}
	});

	it('moves a note to orphans (not lost) when the series origin changes (EC-6)', () => {
		const seriesId = insertSeries(db, { originIso: '2020-06-15', freq: 'yearly' });
		const noteId = upsertOccurrenceNote(
			db,
			seriesId,
			'2022-06-15',
			'Ne pas perdre',
			userId,
			NOW,
			TODAY
		);

		// Origin day changes: 2022-06-15 is no longer a valid occurrence.
		db.update(entries).set({ startSort: '2020-07-01' }).where(eq(entries.id, seriesId)).run();

		const { occurrences, orphans } = listSeriesOccurrences(db, seriesId, TODAY);

		expect(occurrences.every((o) => o.date !== '2022-06-15')).toBe(true);
		expect(orphans).toHaveLength(1);
		expect(orphans[0]).toEqual({
			id: noteId,
			date: '2022-06-15',
			note: 'Ne pas perdre'
		});
	});

	it('rejects a date that is not a valid occurrence of the series with a 400', () => {
		const seriesId = insertSeries(db, { originIso: '2020-06-15', freq: 'yearly' });
		try {
			upsertOccurrenceNote(db, seriesId, '2024-01-01', 'x', userId, NOW, TODAY);
			expect.unreachable('should have thrown');
		} catch (err) {
			expect(err).toBeInstanceOf(HttpError);
			expect((err as HttpError).status).toBe(400);
		}
	});

	it('rejects a future occurrence date with a 400', () => {
		const seriesId = insertSeries(db, { originIso: '2020-06-15', freq: 'yearly' });
		// 2025-06-15 is a valid occurrence but after TODAY (2024-06-15).
		try {
			upsertOccurrenceNote(db, seriesId, '2025-06-15', 'x', userId, NOW, TODAY);
			expect.unreachable('should have thrown');
		} catch (err) {
			expect(err).toBeInstanceOf(HttpError);
			expect((err as HttpError).status).toBe(400);
		}
	});

	it('rejects an unknown or non-recurrent series with a 404', () => {
		expect(() => upsertOccurrenceNote(db, 999999, '2024-01-01', 'x', userId, NOW, TODAY)).toThrow(
			HttpError
		);
		try {
			upsertOccurrenceNote(db, 999999, '2024-01-01', 'x', userId, NOW, TODAY);
		} catch (err) {
			expect(err).toBeInstanceOf(HttpError);
			expect((err as HttpError).status).toBe(404);
		}
	});

	it('honors a caller-supplied `today` rather than reading server config/clock', () => {
		const seriesId = insertSeries(db, { originIso: '2020-06-15', freq: 'yearly' });
		// 2022-06-15 is in the past relative to the real clock, but future
		// relative to an explicit earlier `today`.
		try {
			upsertOccurrenceNote(db, seriesId, '2022-06-15', 'x', userId, NOW, '2021-01-01');
			expect.unreachable('should have thrown');
		} catch (err) {
			expect(err).toBeInstanceOf(HttpError);
			expect((err as HttpError).status).toBe(400);
		}

		// With a `today` on/after the date, it succeeds.
		expect(() =>
			upsertOccurrenceNote(db, seriesId, '2022-06-15', 'x', userId, NOW, '2022-06-15')
		).not.toThrow();
	});

	it('re-upserting after a soft delete clears deletedAt and makes the note visible again', () => {
		const seriesId = insertSeries(db, { originIso: '2020-06-15', freq: 'yearly' });
		const noteId = upsertOccurrenceNote(db, seriesId, '2022-06-15', 'x', userId, NOW, TODAY);
		db.update(occurrenceNotes).set({ deletedAt: NOW }).where(eq(occurrenceNotes.id, noteId)).run();

		const hiddenId = upsertOccurrenceNote(
			db,
			seriesId,
			'2022-06-15',
			'de retour',
			userId,
			NOW,
			TODAY
		);
		expect(hiddenId).toBe(noteId);

		const row = db.select().from(occurrenceNotes).where(eq(occurrenceNotes.id, noteId)).get();
		expect(row?.deletedAt).toBeNull();
		expect(row?.note).toBe('de retour');

		const { occurrences } = listSeriesOccurrences(db, seriesId, TODAY);
		const revived = occurrences.find((o) => o.date === '2022-06-15');
		expect(revived?.note).toBe('de retour');
		expect(revived?.noteId).toBe(noteId);
	});

	it('ensureOccurrenceNote on a soft-deleted note revives it', () => {
		const seriesId = insertSeries(db, { originIso: '2020-06-15', freq: 'yearly' });
		const noteId = ensureOccurrenceNote(db, seriesId, '2021-06-15', userId, NOW, TODAY);
		db.update(occurrenceNotes).set({ deletedAt: NOW }).where(eq(occurrenceNotes.id, noteId)).run();

		const revivedId = ensureOccurrenceNote(db, seriesId, '2021-06-15', userId, NOW, TODAY);
		expect(revivedId).toBe(noteId);

		const { occurrences } = listSeriesOccurrences(db, seriesId, TODAY);
		const revived = occurrences.find((o) => o.date === '2021-06-15');
		expect(revived?.noteId).toBe(noteId);
	});

	it('ensureOccurrenceNote creates an empty note once and is idempotent', () => {
		const seriesId = insertSeries(db, { originIso: '2020-06-15', freq: 'yearly' });

		const id1 = ensureOccurrenceNote(db, seriesId, '2021-06-15', userId, NOW, TODAY);
		const id2 = ensureOccurrenceNote(db, seriesId, '2021-06-15', userId, NOW, TODAY);

		expect(id1).toBe(id2);

		const { occurrences } = listSeriesOccurrences(db, seriesId, TODAY);
		const created = occurrences.find((o) => o.date === '2021-06-15');
		expect(created?.noteId).toBe(id1);
		expect(created?.note).toBeNull();
	});

	it('counts only visible media attached to an occurrence note', () => {
		const seriesId = insertSeries(db, { originIso: '2020-06-15', freq: 'yearly' });
		const noteId = ensureOccurrenceNote(db, seriesId, '2021-06-15', userId, NOW, TODAY);

		db.insert(media)
			.values({
				occurrenceNoteId: noteId,
				kind: 'photo',
				mime: 'image/jpeg',
				storedName: 'a.jpg',
				size: 10,
				originalName: 'a.jpg',
				createdBy: userId,
				createdAt: NOW
			})
			.run();
		const deletedMediaRow = db
			.insert(media)
			.values({
				occurrenceNoteId: noteId,
				kind: 'photo',
				mime: 'image/jpeg',
				storedName: 'b.jpg',
				size: 10,
				originalName: 'b.jpg',
				createdBy: userId,
				createdAt: NOW,
				deletedAt: NOW
			})
			.returning({ id: media.id })
			.get();
		expect(deletedMediaRow.id).toBeTypeOf('number');

		const { occurrences } = listSeriesOccurrences(db, seriesId, TODAY);
		const withMedia = occurrences.find((o) => o.date === '2021-06-15');
		expect(withMedia?.mediaCount).toBe(1);
	});

	it('excludes soft-deleted notes from orphans', () => {
		const seriesId = insertSeries(db, { originIso: '2020-06-15', freq: 'yearly' });
		const noteId = upsertOccurrenceNote(db, seriesId, '2022-06-15', 'x', userId, NOW, TODAY);
		db.update(occurrenceNotes).set({ deletedAt: NOW }).where(eq(occurrenceNotes.id, noteId)).run();

		db.update(entries).set({ startSort: '2020-07-01' }).where(eq(entries.id, seriesId)).run();

		const { orphans } = listSeriesOccurrences(db, seriesId, TODAY);
		expect(orphans).toEqual([]);
	});
});

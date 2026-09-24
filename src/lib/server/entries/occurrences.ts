import { and, eq, isNull } from 'drizzle-orm';
import { occurrenceOn, occurrences, type Frequency } from '../../dates/recurrence';
import type { Db } from '../db';
import { entries, media, occurrenceNotes } from '../db/schema';
import { HttpError } from '../http-error';

export interface SeriesOccurrence {
	date: string;
	note: string | null;
	noteId: number | null;
	mediaCount: number;
}

export interface OrphanOccurrenceNote {
	id: number;
	date: string;
	note: string | null;
}

export interface SeriesOccurrencesResult {
	occurrences: SeriesOccurrence[];
	orphans: OrphanOccurrenceNote[];
}

type SeriesRow = typeof entries.$inferSelect;

/** Loads a visible recurrent series entry, or throws a French 404. */
function getSeriesOrThrow(db: Db, seriesId: number): SeriesRow {
	const series = db
		.select()
		.from(entries)
		.where(and(eq(entries.id, seriesId), isNull(entries.deletedAt)))
		.get();

	if (!series || series.type !== 'recurrent' || !series.recurrenceFreq) {
		throw new HttpError(404, 'Série récurrente introuvable.');
	}

	return series;
}

/** Rejects dates that are not an occurrence of `series`, or that lie in the future. */
function assertValidOccurrenceDate(series: SeriesRow, date: string, today: string): void {
	const freq = series.recurrenceFreq as Frequency;

	if (!occurrenceOn(series.startSort, freq, date, series.endSort)) {
		throw new HttpError(400, "Cette date n'est pas une occurrence de cette série.");
	}

	if (date > today) {
		throw new HttpError(400, 'Impossible de renseigner une occurrence future.');
	}
}

function findNote(
	db: Db,
	seriesId: number,
	date: string
): { id: number; deletedAt: number | null } | null {
	const existing = db
		.select({ id: occurrenceNotes.id, deletedAt: occurrenceNotes.deletedAt })
		.from(occurrenceNotes)
		.where(and(eq(occurrenceNotes.seriesId, seriesId), eq(occurrenceNotes.occurrenceDate, date)))
		.get();
	return existing ?? null;
}

function countMedia(db: Db, occurrenceNoteId: number): number {
	return db
		.select({ id: media.id })
		.from(media)
		.where(and(eq(media.occurrenceNoteId, occurrenceNoteId), isNull(media.deletedAt)))
		.all().length;
}

/**
 * Occurrences of a recurrent series up to `today`, each paired with its note
 * (if any), plus the notes whose date is no longer a valid occurrence of the
 * series (e.g. after the series' origin was changed) — kept as `orphans`
 * rather than lost (EC-6).
 */
export function listSeriesOccurrences(
	db: Db,
	seriesId: number,
	today: string
): SeriesOccurrencesResult {
	const series = getSeriesOrThrow(db, seriesId);
	const freq = series.recurrenceFreq as Frequency;

	const validDates = new Set(occurrences(series.startSort, freq, series.endSort, today));

	const notes = db
		.select()
		.from(occurrenceNotes)
		.where(and(eq(occurrenceNotes.seriesId, seriesId), isNull(occurrenceNotes.deletedAt)))
		.all();
	const notesByDate = new Map(notes.map((n) => [n.occurrenceDate, n]));

	const occurrenceList: SeriesOccurrence[] = [...validDates].sort().map((date) => {
		const note = notesByDate.get(date) ?? null;
		return {
			date,
			note: note?.note ?? null,
			noteId: note?.id ?? null,
			mediaCount: note ? countMedia(db, note.id) : 0
		};
	});

	const orphans: OrphanOccurrenceNote[] = notes
		.filter((n) => !validDates.has(n.occurrenceDate))
		.map((n) => ({ id: n.id, date: n.occurrenceDate, note: n.note }));

	return { occurrences: occurrenceList, orphans };
}

/**
 * Creates or updates the note attached to a series occurrence. Rejects a
 * `date` that is not a valid occurrence of the series or that lies in the
 * future. Returns the note id.
 */
export function upsertOccurrenceNote(
	db: Db,
	seriesId: number,
	date: string,
	note: string | null,
	userId: number,
	now: number,
	today: string
): number {
	const series = getSeriesOrThrow(db, seriesId);
	assertValidOccurrenceDate(series, date, today);

	const existing = findNote(db, seriesId, date);
	if (existing !== null) {
		db.update(occurrenceNotes)
			.set({ note, updatedBy: userId, updatedAt: now, deletedAt: null })
			.where(eq(occurrenceNotes.id, existing.id))
			.run();
		return existing.id;
	}

	const inserted = db
		.insert(occurrenceNotes)
		.values({
			seriesId,
			occurrenceDate: date,
			note,
			createdBy: userId,
			createdAt: now,
			updatedBy: userId,
			updatedAt: now
		})
		.returning({ id: occurrenceNotes.id })
		.get();
	return inserted.id;
}

/**
 * Returns the id of the note for a series occurrence, creating an empty one
 * (note: null) if none exists yet. Used by media upload so a photo/video can
 * always be attached to an occurrence note. Same validation as
 * `upsertOccurrenceNote`.
 */
export function ensureOccurrenceNote(
	db: Db,
	seriesId: number,
	date: string,
	userId: number,
	now: number,
	today: string
): number {
	const series = getSeriesOrThrow(db, seriesId);
	assertValidOccurrenceDate(series, date, today);

	const existing = findNote(db, seriesId, date);
	if (existing !== null) {
		if (existing.deletedAt !== null) {
			db.update(occurrenceNotes)
				.set({ updatedBy: userId, updatedAt: now, deletedAt: null })
				.where(eq(occurrenceNotes.id, existing.id))
				.run();
		}
		return existing.id;
	}

	const inserted = db
		.insert(occurrenceNotes)
		.values({
			seriesId,
			occurrenceDate: date,
			note: null,
			createdBy: userId,
			createdAt: now,
			updatedBy: userId,
			updatedAt: now
		})
		.returning({ id: occurrenceNotes.id })
		.get();
	return inserted.id;
}

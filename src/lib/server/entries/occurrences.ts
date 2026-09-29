import { and, eq, isNull } from 'drizzle-orm';
import { occurrenceOn, occurrences, type Frequency } from '../../dates/recurrence';
import type { Db } from '../db';
import { entries, media, occurrenceNotes } from '../db/schema';
import { HttpError } from '../http-error';
import { assertValidDay, MAX_TEXT_LENGTH } from '../journal/service';

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
	mediaCount: number;
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
	assertValidDay(date);
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
		.map((n) => ({
			id: n.id,
			date: n.occurrenceDate,
			note: n.note,
			mediaCount: countMedia(db, n.id)
		}));

	return { occurrences: occurrenceList, orphans };
}

/**
 * Read-only check that `date` is a valid (past or present) occurrence of a
 * visible recurrent series. Throws `HttpError` 404 (unknown/deleted series) or
 * 400 (malformed date, not an occurrence, or in the future); writes nothing.
 * Returns the series row.
 */
export function assertOccurrence(db: Db, seriesId: number, date: string, today: string): SeriesRow {
	const series = getSeriesOrThrow(db, seriesId);
	assertValidOccurrenceDate(series, date, today);
	return series;
}

export interface OccurrenceDetail {
	seriesTitle: string;
	noteId: number | null;
	note: string | null;
}

/** Validated occurrence (see `assertOccurrence`) with its live note, if any. */
export function getOccurrence(
	db: Db,
	seriesId: number,
	date: string,
	today: string
): OccurrenceDetail {
	const series = assertOccurrence(db, seriesId, date, today);
	const row = db
		.select({ id: occurrenceNotes.id, note: occurrenceNotes.note })
		.from(occurrenceNotes)
		.where(
			and(
				eq(occurrenceNotes.seriesId, seriesId),
				eq(occurrenceNotes.occurrenceDate, date),
				isNull(occurrenceNotes.deletedAt)
			)
		)
		.get();
	return { seriesTitle: series.title, noteId: row?.id ?? null, note: row?.note ?? null };
}

/**
 * Creates the note attached to a series occurrence, or restores it if it was
 * soft-deleted. When `note` is given (string or null) it replaces the note
 * text; when omitted the existing text is left untouched (a new row gets
 * `null`, a live row is not written at all). Same validation as
 * `assertOccurrence`, plus a 400 when the text exceeds `MAX_TEXT_LENGTH`.
 * Returns the note id.
 */
export function upsertOccurrenceNote(
	db: Db,
	seriesId: number,
	date: string,
	note: string | null | undefined,
	userId: number,
	now: number,
	today: string
): number {
	assertOccurrence(db, seriesId, date, today);
	if (note != null && note.length > MAX_TEXT_LENGTH) {
		throw new HttpError(400, 'Note trop longue (50 000 caractères max).');
	}

	const existing = findNote(db, seriesId, date);
	if (existing !== null) {
		if (note === undefined && existing.deletedAt === null) return existing.id;
		db.update(occurrenceNotes)
			.set({
				...(note !== undefined ? { note } : {}),
				updatedBy: userId,
				updatedAt: now,
				deletedAt: null
			})
			.where(eq(occurrenceNotes.id, existing.id))
			.run();
		return existing.id;
	}

	const inserted = db
		.insert(occurrenceNotes)
		.values({
			seriesId,
			occurrenceDate: date,
			note: note ?? null,
			createdBy: userId,
			createdAt: now,
			updatedBy: userId,
			updatedAt: now
		})
		.returning({ id: occurrenceNotes.id })
		.get();
	return inserted.id;
}

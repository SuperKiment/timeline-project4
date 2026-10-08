import { and, eq, inArray, isNull, min } from 'drizzle-orm';
import { compareSortKeys } from '../../dates/fuzzy';
import { occurrences, type Frequency } from '../../dates/recurrence';
import type { EntryType, TimelineItem } from '../../timeline/types';
import type { Db } from '../db';
import { entries, media, occurrenceNotes } from '../db/schema';

export interface GetTimelineOptions {
	/** Entry types to include (recurrent series are expanded into occurrences). */
	types: EntryType[];
	/** ISO day (`YYYY-MM-DD`) up to which recurrent series occurrences are generated. */
	today: string;
}

const OPEN_ENDED_TYPES: ReadonlySet<EntryType> = new Set(['phase', 'histoire']);

/** True for an open-ended type (phase/histoire) that has no end date yet (EC-1). */
export function isOngoing(type: EntryType, endSort: string | null): boolean {
	return OPEN_ENDED_TYPES.has(type) && endSort === null;
}

/**
 * Whether the user has any real content: at least one visible (non-deleted)
 * entry that wasn't seeded (EC-14). User-created `histoire` entries count.
 */
export function hasUserContent(db: Db): boolean {
	const row = db
		.select({ id: entries.id })
		.from(entries)
		.where(and(isNull(entries.deletedAt), isNull(entries.seedKey)))
		.limit(1)
		.get();
	return row !== undefined;
}

/**
 * Builds the full timeline: visible (non-deleted) entries of the requested
 * `types`, with `recurrent` series rows replaced by one `occurrence` item per
 * generated occurrence date (the series row itself is never emitted).
 * Sorted by sort key, then created_at, then id (per Conventions/EC-3).
 */
export function getTimeline(db: Db, { types, today }: GetTimelineOptions): TimelineItem[] {
	if (types.length === 0) return [];

	const rows = db
		.select({
			id: entries.id,
			type: entries.type,
			title: entries.title,
			location: entries.location,
			startSort: entries.startSort,
			startPrecision: entries.startPrecision,
			endSort: entries.endSort,
			endPrecision: entries.endPrecision,
			recurrenceFreq: entries.recurrenceFreq,
			createdAt: entries.createdAt
		})
		.from(entries)
		.where(and(isNull(entries.deletedAt), inArray(entries.type, types)))
		.all();

	const plainIds = rows.filter((row) => row.type !== 'recurrent').map((row) => row.id);
	const seriesIds = rows.filter((row) => row.type === 'recurrent').map((row) => row.id);

	// Batch-fetch the id of the first (lowest-id) visible photo per entry, so
	// thumbnails don't require one query per timeline item (NFR-2).
	const entryThumbRows = plainIds.length
		? db
				.select({ entryId: media.entryId, thumbId: min(media.id).as('thumbId') })
				.from(media)
				.where(
					and(inArray(media.entryId, plainIds), eq(media.kind, 'photo'), isNull(media.deletedAt))
				)
				.groupBy(media.entryId)
				.all()
		: [];
	const entryThumbMap = new Map(entryThumbRows.map((row) => [row.entryId, row.thumbId]));

	// Batch-fetch visible occurrence notes for all recurrent series, keyed by
	// `seriesId|occurrenceDate`, to know which generated occurrences have a
	// note and to find their thumbnail (if any).
	const noteRows = seriesIds.length
		? db
				.select({
					id: occurrenceNotes.id,
					seriesId: occurrenceNotes.seriesId,
					occurrenceDate: occurrenceNotes.occurrenceDate,
					note: occurrenceNotes.note
				})
				.from(occurrenceNotes)
				.where(and(inArray(occurrenceNotes.seriesId, seriesIds), isNull(occurrenceNotes.deletedAt)))
				.all()
		: [];
	const noteMap = new Map(noteRows.map((row) => [`${row.seriesId}|${row.occurrenceDate}`, row]));

	const noteIds = noteRows.map((row) => row.id);
	const noteThumbRows = noteIds.length
		? db
				.select({ noteId: media.occurrenceNoteId, thumbId: min(media.id).as('thumbId') })
				.from(media)
				.where(
					and(
						inArray(media.occurrenceNoteId, noteIds),
						eq(media.kind, 'photo'),
						isNull(media.deletedAt)
					)
				)
				.groupBy(media.occurrenceNoteId)
				.all()
		: [];
	const noteThumbMap = new Map(noteThumbRows.map((row) => [row.noteId, row.thumbId]));

	// `createdAt` is only needed to break sort-key ties; kept alongside the
	// item (not on it) so the returned `TimelineItem`s stay clean.
	const wrapped: { item: TimelineItem; createdAt: number }[] = [];

	for (const row of rows) {
		if (row.type === 'recurrent') {
			if (row.recurrenceFreq === null) continue; // defensive: should never happen
			const dates = occurrences(row.startSort, row.recurrenceFreq as Frequency, row.endSort, today);
			for (const date of dates) {
				const note = noteMap.get(`${row.id}|${date}`);
				const thumbId = note ? noteThumbMap.get(note.id) : undefined;
				wrapped.push({
					item: {
						kind: 'occurrence',
						key: `o:${row.id}:${date}`,
						id: row.id,
						type: row.type,
						title: row.title,
						startSort: date,
						startPrecision: 'day',
						endSort: null,
						endPrecision: null,
						ongoing: false,
						seriesId: row.id,
						occurrenceDate: date,
						hasNote: Boolean(note?.note && note.note.trim() !== ''),
						thumbUrl: thumbId !== undefined ? `/media/${thumbId}/thumb-sm` : null,
						location: row.location
					},
					createdAt: row.createdAt
				});
			}
		} else {
			const thumbId = entryThumbMap.get(row.id);
			wrapped.push({
				item: {
					kind: 'entry',
					key: `e:${row.id}`,
					id: row.id,
					type: row.type,
					title: row.title,
					startSort: row.startSort,
					startPrecision: row.startPrecision,
					endSort: row.endSort,
					endPrecision: row.endPrecision,
					ongoing: isOngoing(row.type, row.endSort),
					thumbUrl: thumbId !== undefined ? `/media/${thumbId}/thumb-sm` : null,
					location: row.location
				},
				createdAt: row.createdAt
			});
		}
	}

	wrapped.sort((a, b) => {
		const bySortKey = compareSortKeys(a.item.startSort, b.item.startSort);
		if (bySortKey !== 0) return bySortKey;
		if (a.createdAt !== b.createdAt) return a.createdAt - b.createdAt;
		return a.item.id - b.item.id;
	});

	return wrapped.map((w) => w.item);
}

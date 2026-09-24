/**
 * Client-safe shared timeline types (no server imports — usable from Svelte
 * components as well as server code). Extended by T13 with `TimelineItem`.
 */

import type { Precision } from '../dates/fuzzy';

export const ENTRY_TYPES = ['souvenir', 'important', 'phase', 'recurrent', 'histoire'] as const;
export type EntryType = (typeof ENTRY_TYPES)[number];

/**
 * A single row rendered on the timeline: either a plain entry, or one
 * generated occurrence of a `recurrent` series. The series entry itself is
 * never emitted as an `entry` item — see `getTimeline`.
 */
export interface TimelineItem {
	kind: 'entry' | 'occurrence';
	/**
	 * Unique key for keyed `{#each}` rendering: `e:<id>` for entries,
	 * `o:<seriesId>:<occurrenceDate>` for occurrences (since occurrence items
	 * share `id` with their series and thus `id` alone is not unique).
	 */
	key: string;
	/** Entry id (for `occurrence` items: id of the recurrent series entry). */
	id: number;
	type: EntryType;
	title: string;
	startSort: string;
	startPrecision: Precision;
	endSort: string | null;
	endPrecision: Precision | null;
	/** True for open-ended `phase`/`histoire` entries with no end date yet (EC-1). */
	ongoing: boolean;
	/** Present on `occurrence` items: id of the recurrent series entry (same as `id`). */
	seriesId?: number;
	/** Present on `occurrence` items: the generated ISO day (`YYYY-MM-DD`). */
	occurrenceDate?: string;
	/** Present on `occurrence` items: whether that occurrence has a non-empty note. */
	hasNote?: boolean;
	/** `/media/<id>/thumb` of the first visible photo, or `null` when none. */
	thumbUrl: string | null;
	location: string | null;
}

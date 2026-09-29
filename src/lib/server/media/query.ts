import { and, asc, inArray, isNull } from 'drizzle-orm';
import type { Db } from '../db';
import { media } from '../db/schema';
import type { MediaItem } from '$lib/media/types';

/** Kind of record a media row is attached to. */
export type MediaOwnerKind = 'entry' | 'occurrence' | 'journal';

const OWNER_COLUMN = {
	entry: media.entryId,
	occurrence: media.occurrenceNoteId,
	journal: media.journalEntryId
} as const;

/** Fields of a media row needed to build its client-safe `MediaItem`. */
type MediaRowLike = Pick<typeof media.$inferSelect, 'id' | 'kind' | 'thumbName' | 'posterName'>;

/**
 * Builds the client-safe `MediaItem` for a media row. Photos use the thumbnail,
 * videos the poster; a video without a poster gets an empty `thumbUrl`.
 */
export function toMediaItem(row: MediaRowLike): MediaItem {
	const hasThumb = row.kind === 'photo' ? row.thumbName !== null : row.posterName !== null;
	const thumbKind = row.kind === 'photo' ? 'thumb' : 'poster';
	return {
		id: row.id,
		kind: row.kind,
		thumbUrl: hasThumb ? `/media/${row.id}/${thumbKind}` : '',
		url: `/media/${row.id}/original`
	};
}

/**
 * Lists the non-deleted media of the given owners, ordered by `created_at`
 * then `id`. Every id in `ownerIds` gets an entry in the returned map (an
 * empty array when it has no media). Empty input yields an empty map.
 */
export function listMediaByOwner(
	db: Db,
	ownerKind: MediaOwnerKind,
	ownerIds: number[]
): Map<number, MediaItem[]> {
	const result = new Map<number, MediaItem[]>();
	const ids = [...new Set(ownerIds)];
	if (ids.length === 0) return result;
	for (const id of ids) result.set(id, []);

	const column = OWNER_COLUMN[ownerKind];
	const rows = db
		.select({
			ownerId: column,
			id: media.id,
			kind: media.kind,
			thumbName: media.thumbName,
			posterName: media.posterName
		})
		.from(media)
		.where(and(inArray(column, ids), isNull(media.deletedAt)))
		.orderBy(asc(media.createdAt), asc(media.id))
		.all();

	for (const row of rows) {
		if (row.ownerId !== null) result.get(row.ownerId)?.push(toMediaItem(row));
	}
	return result;
}

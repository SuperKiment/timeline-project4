/**
 * Client-safe media types (no server imports — usable from Svelte components
 * as well as server code).
 */

/** Media item as returned by `POST /api/media` and rendered by the gallery. */
export interface MediaItem {
	id: number;
	/** Mirrors `MediaKind` in src/lib/server/db/schema.ts (kept separate for client-safety). */
	kind: 'photo' | 'video';
	/** Thumbnail/poster URL; empty for videos without a poster. */
	thumbUrl: string;
	url: string;
}

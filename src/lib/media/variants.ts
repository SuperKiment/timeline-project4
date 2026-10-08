/**
 * Photo variant sizes (client-safe: shared by the server image pipeline and
 * the gallery's `srcset`).
 */

/** `thumb`: WebP, this many px wide (grid cells). */
export const THUMB_WIDTH = 400;

/** `thumb-sm`: WebP square crop, this many px (56px timeline card thumbnail at 3×). */
export const THUMB_SM_SIZE = 168;

/** `display`: WebP, long edge capped at this many px (full-screen viewer). */
export const DISPLAY_MAX_EDGE = 2048;

/**
 * `srcset` for the full-screen viewer (`thumb` + `display`, `w` descriptors),
 * computed from the original's dimensions the way the server resizes them
 * (never enlarged). `undefined` when the dimensions are unknown.
 */
export function viewerSrcset(item: {
	thumbUrl: string;
	displayUrl: string;
	width: number | null;
	height: number | null;
}): string | undefined {
	const { width, height } = item;
	if (!width || !height) return undefined;
	const displayWidth = Math.round(width * Math.min(1, DISPLAY_MAX_EDGE / Math.max(width, height)));
	return `${item.thumbUrl} ${Math.min(width, THUMB_WIDTH)}w, ${item.displayUrl} ${displayWidth}w`;
}

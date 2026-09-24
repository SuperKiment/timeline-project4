import fs from 'node:fs';
import { promises as fsPromises } from 'node:fs';
import { Readable } from 'node:stream';
import { eq } from 'drizzle-orm';
import type { Db } from '../db';
import { entries, journalEntries, media, occurrenceNotes } from '../db/schema';
import { mediaPath } from './storage';

/** The three file variants a media row may be served as (T17/T18). */
export const VARIANTS = ['original', 'thumb', 'poster'] as const;
export type Variant = (typeof VARIANTS)[number];

const NOT_FOUND = () => new Response(null, { status: 404 });

type MediaRow = typeof media.$inferSelect;

/**
 * Whether `row`'s owner (the entry, the series entry of an occurrence note,
 * or a journal entry) is still visible. Media rows are never stamped by
 * their parent's soft delete (Conventions: "children ... are hidden by
 * parent visibility"), so this must be checked explicitly on every read
 * (EC-16).
 */
function ownerVisible(db: Db, row: MediaRow): boolean {
	if (row.entryId !== null) {
		const entry = db
			.select({ deletedAt: entries.deletedAt })
			.from(entries)
			.where(eq(entries.id, row.entryId))
			.get();
		return !!entry && entry.deletedAt === null;
	}

	if (row.occurrenceNoteId !== null) {
		const note = db
			.select({ deletedAt: occurrenceNotes.deletedAt, seriesId: occurrenceNotes.seriesId })
			.from(occurrenceNotes)
			.where(eq(occurrenceNotes.id, row.occurrenceNoteId))
			.get();
		if (!note || note.deletedAt !== null) {
			return false;
		}
		const series = db
			.select({ deletedAt: entries.deletedAt })
			.from(entries)
			.where(eq(entries.id, note.seriesId))
			.get();
		return !!series && series.deletedAt === null;
	}

	if (row.journalEntryId !== null) {
		const journal = db
			.select({ deletedAt: journalEntries.deletedAt })
			.from(journalEntries)
			.where(eq(journalEntries.id, row.journalEntryId))
			.get();
		return !!journal && journal.deletedAt === null;
	}

	// No owner set at all should be impossible (DB CHECK constraint), but
	// fail closed rather than serve an orphan file.
	return false;
}

/** The on-disk file name and MIME type to serve for a given variant, or `null` if that variant doesn't exist for this row. */
function variantFile(row: MediaRow, variant: Variant): { name: string; mime: string } | null {
	switch (variant) {
		case 'original':
			return { name: row.storedName, mime: row.mime };
		case 'thumb':
			return row.thumbName ? { name: row.thumbName, mime: 'image/webp' } : null;
		case 'poster':
			return row.posterName ? { name: row.posterName, mime: 'image/jpeg' } : null;
	}
}

interface ByteRange {
	start: number;
	end: number;
}

/**
 * Parses a single-range `Range` header (`bytes=a-b`, `bytes=a-`, `bytes=-n`)
 * against a known file `size`. Returns `null` when there is no range to
 * apply (missing header, malformed syntax, or a `first-byte-pos` greater
 * than `last-byte-pos`, which RFC 9110 §14.1.2 makes an invalid
 * byte-range-spec — served in full per RFC 7233 §3.1), `'unsatisfiable'`
 * when the range is syntactically valid but out of bounds, or the resolved
 * inclusive `[start, end]` otherwise.
 */
function parseRange(rangeHeader: string | null, size: number): ByteRange | 'unsatisfiable' | null {
	if (!rangeHeader) {
		return null;
	}
	const match = /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
	if (!match || (match[1] === '' && match[2] === '')) {
		return null;
	}

	let start: number;
	let end: number;
	if (match[1] === '') {
		// Suffix range: last N bytes.
		const suffixLength = Number(match[2]);
		if (!Number.isFinite(suffixLength) || suffixLength <= 0) {
			return 'unsatisfiable';
		}
		start = Math.max(0, size - suffixLength);
		end = size - 1;
	} else {
		start = Number(match[1]);
		if (match[2] === '') {
			end = size - 1;
		} else {
			end = Number(match[2]);
			if (Number.isFinite(start) && Number.isFinite(end) && start > end) {
				// Syntactically invalid byte-range-spec (RFC 9110 §14.1.2):
				// first-byte-pos must be <= last-byte-pos. Ignore the Range
				// header entirely rather than treating it as unsatisfiable.
				return null;
			}
		}
	}

	if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || start >= size) {
		return 'unsatisfiable';
	}

	return { start, end: Math.min(end, size - 1) };
}

/**
 * Serves a media file with HTTP Range support. Resolves the on-disk path
 * exclusively via {@link mediaPath} (never a client-supplied path, NFR-4)
 * and returns 404 for a missing row, a soft-deleted media row, a
 * soft-deleted owner (EC-16), or a variant this row doesn't have (e.g. a
 * `thumb` for a video). Authentication/authorization for the route itself
 * is enforced by the hooks guard (T9); this function only decides
 * visibility of the media row.
 */
export async function serveMedia(
	db: Db,
	id: number,
	variant: Variant,
	rangeHeader: string | null
): Promise<Response> {
	const row = db.select().from(media).where(eq(media.id, id)).get();
	if (!row || row.deletedAt !== null) {
		return NOT_FOUND();
	}
	if (!ownerVisible(db, row)) {
		return NOT_FOUND();
	}

	const file = variantFile(row, variant);
	if (!file) {
		return NOT_FOUND();
	}

	let filePath: string;
	try {
		filePath = mediaPath(file.name);
	} catch {
		return NOT_FOUND();
	}

	let stat: fs.Stats;
	try {
		stat = await fsPromises.stat(filePath);
	} catch {
		return NOT_FOUND();
	}

	const size = stat.size;
	const range = parseRange(rangeHeader, size);

	const headers = new Headers({
		'Content-Type': file.mime,
		'Accept-Ranges': 'bytes',
		'Cache-Control': 'private, max-age=31536000, immutable'
	});

	if (range === 'unsatisfiable') {
		headers.set('Content-Range', `bytes */${size}`);
		return new Response(null, { status: 416, headers });
	}

	// Only successful (200/206) responses carry a body a browser could sniff.
	headers.set('X-Content-Type-Options', 'nosniff');

	if (range) {
		const { start, end } = range;
		headers.set('Content-Range', `bytes ${start}-${end}/${size}`);
		headers.set('Content-Length', String(end - start + 1));
		const stream = fs.createReadStream(filePath, { start, end });
		return new Response(Readable.toWeb(stream) as ReadableStream, { status: 206, headers });
	}

	headers.set('Content-Length', String(size));
	const stream = fs.createReadStream(filePath);
	return new Response(Readable.toWeb(stream) as ReadableStream, { status: 200, headers });
}

import fs from 'node:fs';
import { promises as fsPromises } from 'node:fs';
import { Readable } from 'node:stream';
import { eq } from 'drizzle-orm';
import type { Db } from '../db';
import { entries, journalEntries, media, occurrenceNotes } from '../db/schema';
import { derivedName, mediaPath } from './storage';

/** The file variants a media row may be served as (T17/T18, plus the derived photo variants). */
export const VARIANTS = ['original', 'thumb', 'poster', 'display', 'thumb-sm'] as const;
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

interface VariantFile {
	name: string;
	mime: string;
}

/**
 * The on-disk files that may serve `variant` for this row, best first: a
 * derived photo variant missing on disk (media stored before it existed,
 * see `derivedName`) falls back to the next larger one, ending with the
 * original. Empty when the variant doesn't exist for this row (e.g. a
 * `thumb` for a video).
 */
function variantFiles(row: MediaRow, variant: Variant): VariantFile[] {
	const original = { name: row.storedName, mime: row.mime };
	const thumb = row.thumbName ? [{ name: row.thumbName, mime: 'image/webp' }] : [];
	const derived = (name: 'display' | 'thumb-sm') => ({
		name: derivedName(row.storedName, name),
		mime: 'image/webp'
	});
	switch (variant) {
		case 'original':
			return [original];
		case 'thumb':
			return thumb;
		case 'poster':
			return row.posterName ? [{ name: row.posterName, mime: 'image/jpeg' }] : [];
		case 'display':
			return row.kind === 'photo' ? [derived('display'), original] : [];
		case 'thumb-sm':
			return row.kind === 'photo' ? [derived('thumb-sm'), ...thumb, original] : [];
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
 * `thumb` for a video) or whose files are all missing on disk.
 * Authentication/authorization for the route itself is enforced by the
 * hooks guard (T9); this function only decides visibility of the media row.
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

	// Serve the first candidate present on disk (see variantFiles).
	const candidates = variantFiles(row, variant);
	let served: { file: VariantFile; filePath: string; stat: fs.Stats } | undefined;
	for (const file of candidates) {
		try {
			const filePath = mediaPath(file.name);
			served = { file, filePath, stat: await fsPromises.stat(filePath) };
			break;
		} catch {
			// Invalid name or missing file: try the next candidate.
		}
	}
	if (!served) {
		return NOT_FOUND();
	}
	const { file, filePath, stat } = served;

	const size = stat.size;
	const range = parseRange(rangeHeader, size);

	const headers = new Headers({
		'Content-Type': file.mime,
		'Accept-Ranges': 'bytes',
		// A fallback is cached briefly only, so the real variant is picked up
		// once `npm run media:backfill` has generated it.
		'Cache-Control':
			file !== candidates[0] ? 'private, max-age=86400' : 'private, max-age=31536000, immutable'
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

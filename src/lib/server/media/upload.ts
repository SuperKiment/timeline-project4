import { randomBytes } from 'node:crypto';
import { createWriteStream, promises as fsp } from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream as NodeReadableStream } from 'node:stream/web';
import busboy from 'busboy';
import { eq } from 'drizzle-orm';
import { json } from '@sveltejs/kit';
import { getConfig } from '../config';
import type { Db } from '../db';
import { entries, journalEntries, media } from '../db/schema';
import { ensureOccurrenceNote } from '../entries/occurrences';
import { HttpError } from '../http-error';
import { todayIn } from '../time';
import { processPhoto } from './images';
import {
	ensureMediaDir,
	mediaPath,
	newStoredName,
	removeMediaFiles,
	type StoredMediaFiles
} from './storage';
import {
	MAX_BYTES as DEFAULT_MAX_BYTES,
	MediaError,
	sniffAndValidate,
	type MediaKind
} from './validate';
import { makePoster } from './video';

/** Minimal shape of the authenticated user needed to process an upload. */
export interface UploadUser {
	id: number;
}

export interface UploadedMediaItem {
	id: number;
	kind: MediaKind;
	thumbUrl: string;
	url: string;
}

/** Multipart part limits (DoS guard): max files, total parts, text fields, and per-field bytes. */
const MAX_FILES = 20;
const MAX_PARTS = 40;
const MAX_FIELDS = 20;
const MAX_FIELD_SIZE = 64 * 1024;

/** Raised when a multipart body exceeds a part-count or field-size limit (mapped to 413). */
class UploadLimitError extends Error {}

/** Raised as soon as a single file part exceeds the size cap (mapped to 413 with the file message). */
const FILE_TOO_LARGE_MESSAGE = 'Fichier trop volumineux (max 500 Mo)';

class FileTooLargeError extends UploadLimitError {
	constructor() {
		super(FILE_TOO_LARGE_MESSAGE);
	}
}

let maxBytesOverride: number | null = null;

/**
 * Test-only override of the per-file upload size limit (default: `MAX_BYTES`
 * from `validate.ts`, 500 MB). Pass `null` to restore the default.
 */
export function setMaxBytesForTests(bytes: number | null): void {
	maxBytesOverride = bytes;
}

function currentMaxBytes(): number {
	return maxBytesOverride ?? DEFAULT_MAX_BYTES;
}

function errorResponse(status: number, message: string): Response {
	return json({ message }, { status });
}

function isEnospc(err: unknown): boolean {
	return err instanceof Error && (err as NodeJS.ErrnoException).code === 'ENOSPC';
}

/**
 * Maps a failure from owner resolution or file processing to the matching
 * HTTP response: `HttpError` statuses are propagated as-is (e.g. 404/400 from
 * `ensureOccurrenceNote`), `MediaError` uses its own status (415, or 413 for oversized photos), a disk-full error
 * becomes 507 (EC-12, F4), anything else is a generic 500.
 */
function errorFromException(err: unknown): Response {
	if (err instanceof HttpError) {
		return errorResponse(err.status, err.message);
	}
	if (err instanceof MediaError) {
		return errorResponse(err.status, err.message);
	}
	if (isEnospc(err)) {
		return errorResponse(507, 'Espace disque insuffisant');
	}
	return errorResponse(500, 'Erreur serveur.');
}

interface ParsedFile {
	tmpPath: string;
	filename: string;
}

/** Deletes every parsed file's temp file, ignoring ones already gone/moved. */
async function cleanupTmp(files: ParsedFile[]): Promise<void> {
	await Promise.all(files.map((file) => fsp.unlink(file.tmpPath).catch(() => {})));
}

/**
 * Parses a `multipart/form-data` request body, streaming each file part to
 * its own random file under `tmpDir` (never trusting the client file name for
 * the on-disk path, FR-23). Rejects (after best-effort tmp cleanup) on a
 * malformed body or a body stream error/abort.
 */
function parseMultipart(
	request: Request,
	contentType: string,
	tmpDir: string,
	maxBytes: number
): Promise<{ fields: Record<string, string>; files: ParsedFile[] }> {
	return new Promise((resolve, reject) => {
		const bb = busboy({
			headers: { 'content-type': contentType },
			limits: {
				// busboy emits 'limit' when size === fileSize; +1 makes the cap inclusive.
				fileSize: maxBytes + 1,
				files: MAX_FILES,
				parts: MAX_PARTS,
				fields: MAX_FIELDS,
				fieldSize: MAX_FIELD_SIZE
			}
		});
		const fields: Record<string, string> = {};
		const files: ParsedFile[] = [];
		const writes: Promise<void>[] = [];
		let settled = false;
		// Cumulative file bytes across all parts, capped at `maxBytes` (disk-fill guard).
		let totalBytes = 0;

		const nodeStream = request.body
			? Readable.fromWeb(request.body as unknown as NodeReadableStream<Uint8Array>)
			: undefined;

		const fail = (err: unknown) => {
			if (settled) return;
			settled = true;
			bb.destroy();
			// Cancel the source body stream too (its 'error' listener is already attached).
			nodeStream?.destroy();
			// Let in-flight tmp writes settle first: unlinking a file whose write
			// stream has not opened yet would leave it behind.
			void Promise.allSettled(writes)
				.then(() => cleanupTmp(files))
				.finally(() => reject(err));
		};

		bb.on('field', (name, value, info) => {
			if (info.valueTruncated || info.nameTruncated) {
				fail(new UploadLimitError('Champ trop volumineux.'));
				return;
			}
			fields[name] = value;
		});

		for (const event of ['filesLimit', 'partsLimit', 'fieldsLimit']) {
			bb.on(event, () => fail(new UploadLimitError('Trop de parties dans la requête.')));
		}

		bb.on('file', (_name, stream, info) => {
			if (settled) {
				// Parse already failed: discard, never create a tmp file.
				stream.resume();
				return;
			}
			const tmpPath = path.join(tmpDir, randomBytes(16).toString('hex'));
			files.push({ tmpPath, filename: info.filename });
			// Abort right away instead of parsing the rest of the body to disk. Deferred:
			// busboy still touches the file stream after emitting 'limit', so destroying
			// the parser synchronously here would make it crash.
			stream.on('limit', () => queueMicrotask(() => fail(new FileTooLargeError())));
			stream.on('data', (chunk: Buffer) => {
				totalBytes += chunk.length;
				if (totalBytes > maxBytes) {
					fail(new UploadLimitError('Volume total trop important.'));
				}
			});
			const writeStream = createWriteStream(tmpPath);
			writes.push(pipeline(stream, writeStream).catch((err) => fail(err)));
		});

		bb.on('error', (err) => fail(err));

		bb.on('close', () => {
			if (settled) return;
			Promise.all(writes)
				.then(() => {
					if (settled) return;
					settled = true;
					resolve({ fields, files });
				})
				.catch((err) => fail(err));
		});

		if (!nodeStream) {
			fail(new Error('Requête sans corps.'));
			return;
		}

		nodeStream.on('error', (err) => fail(err));
		nodeStream.pipe(bb);
	});
}

interface ResolvedOwner {
	entryId: number | null;
	occurrenceNoteId: number | null;
	journalEntryId: number | null;
}

function parseId(label: string, value: string | undefined): number {
	const id = value !== undefined ? Number(value) : NaN;
	if (!Number.isInteger(id) || id <= 0) {
		throw new HttpError(400, `${label} invalide.`);
	}
	return id;
}

/**
 * Resolves and authorizes the owner (entry / occurrence / journal entry) a
 * batch of uploaded files will be attached to, from the request's non-file
 * form fields (`ownerKind`, `ownerId`, and for occurrences `seriesId`+`date`).
 * Throws `HttpError` (400/403/404) on any invalid or unauthorized owner.
 */
function resolveOwner(
	db: Db,
	fields: Record<string, string>,
	user: UploadUser,
	now: number,
	today: string
): ResolvedOwner {
	const ownerKind = fields.ownerKind;

	if (ownerKind === 'entry') {
		const entryId = parseId('ownerId', fields.ownerId);
		const entry = db
			.select({ deletedAt: entries.deletedAt })
			.from(entries)
			.where(eq(entries.id, entryId))
			.get();
		if (!entry || entry.deletedAt !== null) {
			throw new HttpError(404, 'Entrée introuvable.');
		}
		return { entryId, occurrenceNoteId: null, journalEntryId: null };
	}

	if (ownerKind === 'occurrence') {
		const seriesId = parseId('seriesId', fields.seriesId);
		const date = fields.date;
		if (!date) {
			throw new HttpError(400, 'Date invalide.');
		}
		const occurrenceNoteId = ensureOccurrenceNote(db, seriesId, date, user.id, now, today);
		return { entryId: null, occurrenceNoteId, journalEntryId: null };
	}

	if (ownerKind === 'journal') {
		const journalEntryId = parseId('ownerId', fields.ownerId);
		const journal = db
			.select({ userId: journalEntries.userId, deletedAt: journalEntries.deletedAt })
			.from(journalEntries)
			.where(eq(journalEntries.id, journalEntryId))
			.get();
		if (!journal || journal.deletedAt !== null) {
			throw new HttpError(404, 'Entrée de journal introuvable.');
		}
		if (journal.userId !== user.id) {
			throw new HttpError(
				403,
				"Vous ne pouvez ajouter de médias qu'à vos propres entrées de journal."
			);
		}
		return { entryId: null, occurrenceNoteId: null, journalEntryId };
	}

	throw new HttpError(400, 'Type de propriétaire invalide.');
}

/** Inserts a media row inside its own transaction. */
function insertMediaRow(db: Db, values: typeof media.$inferInsert): typeof media.$inferSelect {
	return db.transaction((tx) => tx.insert(media).values(values).returning().get());
}

interface ProcessedFile {
	item: UploadedMediaItem;
	files: StoredMediaFiles;
}

/**
 * Validates, converts/moves and stores a single uploaded file (photo via
 * T17's `processPhoto`, video via a plain move + optional poster via T18's
 * `makePoster`), then inserts its `media` row. Throws `MediaError` (415) on
 * an invalid/undecodable file, or lets filesystem errors (e.g. `ENOSPC`,
 * EC-12) propagate unchanged.
 */
async function processFile(
	db: Db,
	file: ParsedFile,
	owner: ResolvedOwner,
	userId: number,
	now: number
): Promise<ProcessedFile> {
	const sniff = await sniffAndValidate(file.tmpPath, file.filename);

	if (sniff.kind === 'photo') {
		const processed = await processPhoto(file.tmpPath, sniff);
		// The source tmp file was only read (never moved) by processPhoto; it's
		// no longer needed once the original/thumb have been written.
		await fsp.unlink(file.tmpPath).catch(() => {});

		// EC-9: files are on disk but not yet in `produced`, so clean them up here.
		try {
			const row = insertMediaRow(db, {
				entryId: owner.entryId,
				occurrenceNoteId: owner.occurrenceNoteId,
				journalEntryId: owner.journalEntryId,
				kind: 'photo',
				mime: processed.mime,
				storedName: processed.storedName,
				thumbName: processed.thumbName,
				posterName: null,
				size: (await fsp.stat(mediaPath(processed.storedName))).size,
				width: processed.width,
				height: processed.height,
				originalName: file.filename,
				createdBy: userId,
				createdAt: now
			});

			return {
				item: {
					id: row.id,
					kind: 'photo',
					thumbUrl: `/media/${row.id}/thumb`,
					url: `/media/${row.id}/original`
				},
				files: { storedName: processed.storedName, thumbName: processed.thumbName }
			};
		} catch (err) {
			await removeMediaFiles({
				storedName: processed.storedName,
				thumbName: processed.thumbName
			}).catch(() => {});
			throw err;
		}
	}

	// Video: move the tmp file into mediaDir under a random name (never the
	// client-provided name, FR-23), then best-effort a poster frame (T18).
	await ensureMediaDir();
	const storedName = newStoredName(sniff.ext);
	const destPath = mediaPath(storedName);
	await fsp.rename(file.tmpPath, destPath);

	const posterName = newStoredName('jpg');
	// EC-9: files are on disk but not yet in `produced`, so clean them up here.
	try {
		const size = (await fsp.stat(destPath)).size;
		const posterOk = await makePoster(destPath, mediaPath(posterName));
		// ffmpeg can exit non-zero after writing a partial frame: drop it so no
		// orphan file is left behind (EC-9).
		if (!posterOk) await fsp.unlink(mediaPath(posterName)).catch(() => {});

		const row = insertMediaRow(db, {
			entryId: owner.entryId,
			occurrenceNoteId: owner.occurrenceNoteId,
			journalEntryId: owner.journalEntryId,
			kind: 'video',
			mime: sniff.mime,
			storedName,
			thumbName: null,
			posterName: posterOk ? posterName : null,
			size,
			width: null,
			height: null,
			originalName: file.filename,
			createdBy: userId,
			createdAt: now
		});

		return {
			item: {
				id: row.id,
				kind: 'video',
				thumbUrl: posterOk ? `/media/${row.id}/poster` : '',
				url: `/media/${row.id}/original`
			},
			files: { storedName, posterName: posterOk ? posterName : null }
		};
	} catch (err) {
		await removeMediaFiles({ storedName, posterName }).catch(() => {});
		throw err;
	}
}

/**
 * Handles a `multipart/form-data` media upload for `POST /api/media`: parses
 * fields + files, resolves/authorizes the owner (entry, series occurrence, or
 * the caller's own journal entry), then validates and stores each file,
 * returning `[{id, kind, thumbUrl, url}]` as JSON (FR-21, AC-7).
 *
 * Any failure (invalid owner, oversized file, undecodable file, disk full,
 * an aborted request body, ...) leaves no orphan rows or files behind: tmp
 * files are always removed, and any `media` rows/files already produced
 * earlier in the same batch are rolled back too (EC-9). A disk-full error at
 * any stage is reported as 507 rather than a generic error (EC-12, F4).
 */
export async function handleUpload(
	db: Db,
	request: Request,
	user: UploadUser,
	now: number
): Promise<Response> {
	const contentType = request.headers.get('content-type');
	if (!request.body || !contentType) {
		return errorResponse(400, 'Requête invalide.');
	}

	const config = getConfig();
	await fsp.mkdir(config.tmpDir, { recursive: true });

	let fields: Record<string, string>;
	let files: ParsedFile[];
	try {
		({ fields, files } = await parseMultipart(
			request,
			contentType,
			config.tmpDir,
			currentMaxBytes()
		));
	} catch (err) {
		if (err instanceof FileTooLargeError) {
			return errorResponse(413, FILE_TOO_LARGE_MESSAGE);
		}
		if (err instanceof UploadLimitError) {
			return errorResponse(413, 'Requête trop volumineuse.');
		}
		if (isEnospc(err)) {
			return errorResponse(507, 'Espace disque insuffisant');
		}
		return errorResponse(400, 'Téléversement interrompu.');
	}

	if (files.length === 0) {
		return errorResponse(400, 'Aucun fichier reçu.');
	}

	const today = todayIn(config.tz, new Date(now));

	let owner: ResolvedOwner;
	try {
		owner = resolveOwner(db, fields, user, now, today);
	} catch (err) {
		await cleanupTmp(files);
		return errorFromException(err);
	}

	const uploaded: UploadedMediaItem[] = [];
	const produced: { id: number; files: StoredMediaFiles }[] = [];

	try {
		for (const file of files) {
			const { item, files: storedFiles } = await processFile(db, file, owner, user.id, now);
			uploaded.push(item);
			produced.push({ id: item.id, files: storedFiles });
		}
	} catch (err) {
		for (const row of produced) {
			try {
				db.delete(media).where(eq(media.id, row.id)).run();
			} catch {
				// best-effort rollback: keep going
			}
			await removeMediaFiles(row.files).catch(() => {});
		}
		await cleanupTmp(files);
		return errorFromException(err);
	}

	return json(uploaded);
}

/**
 * Soft-deletes a media row (FR-24). Journal media can only be deleted by its
 * owning user (403); entry/occurrence media is shared (no per-user check).
 */
export function deleteMedia(db: Db, id: number, userId: number, now: number): void {
	const row = db.select().from(media).where(eq(media.id, id)).get();
	if (!row || row.deletedAt !== null) {
		throw new HttpError(404, 'Média introuvable.');
	}

	if (row.journalEntryId !== null) {
		const journal = db
			.select({ userId: journalEntries.userId })
			.from(journalEntries)
			.where(eq(journalEntries.id, row.journalEntryId))
			.get();
		if (!journal || journal.userId !== userId) {
			throw new HttpError(403, 'Vous ne pouvez supprimer que vos propres médias de journal.');
		}
	}

	db.update(media).set({ deletedAt: now }).where(eq(media.id, id)).run();
}

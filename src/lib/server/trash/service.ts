import { and, eq, inArray, isNotNull, isNull, lt, lte, or } from 'drizzle-orm';
import type { Db } from '../db';
import { entries, journalEntries, media, occurrenceNotes, sessions } from '../db/schema';
import { HttpError } from '../http-error';
import { removeMediaFiles, type StoredMediaFiles } from '../media/storage';

export const TRASH_RETENTION_DAYS = 30;
export const TRASH_RETENTION_MS = TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000;

export const TRASH_KINDS = ['entry', 'occurrenceNote', 'journal', 'media'] as const;
export type TrashKind = (typeof TRASH_KINDS)[number];

export interface TrashItem {
	kind: TrashKind;
	id: number;
	/** Display label (entry title, "Journal du <day>", occurrence label, media file name). */
	title: string;
	deletedAt: number;
	/** `deletedAt + 30 days`: when the scheduled purge removes the item for good. */
	expiresAt: number;
	/** Journal author (only journal items and media attached to a journal entry), else null. */
	ownerId: number | null;
}

function expiryOf(deletedAt: number): number {
	return deletedAt + TRASH_RETENTION_MS;
}

/**
 * Top-level deleted items, newest deletion first. "Top-level" means the item
 * is soft-deleted while its parent is NOT: children of a deleted parent are
 * hidden by the parent and come back with it (EC-5), so they are not listed.
 * - entries (incl. recurrent series): always top-level;
 * - journal entries: always top-level;
 * - occurrence notes: only when their series is live;
 * - media: only when their owner (entry / occurrence note / journal entry)
 *   and, for a note's media, the note's series are all live.
 */
export function listTrash(db: Db): TrashItem[] {
	const items: TrashItem[] = [];

	for (const e of db.select().from(entries).where(isNotNull(entries.deletedAt)).all()) {
		items.push({
			kind: 'entry',
			id: e.id,
			title: e.title,
			deletedAt: e.deletedAt!,
			expiresAt: expiryOf(e.deletedAt!),
			ownerId: null
		});
	}

	for (const j of db
		.select()
		.from(journalEntries)
		.where(isNotNull(journalEntries.deletedAt))
		.all()) {
		items.push({
			kind: 'journal',
			id: j.id,
			title: `Journal du ${j.day}`,
			deletedAt: j.deletedAt!,
			expiresAt: expiryOf(j.deletedAt!),
			ownerId: j.userId
		});
	}

	const notes = db
		.select({
			id: occurrenceNotes.id,
			date: occurrenceNotes.occurrenceDate,
			deletedAt: occurrenceNotes.deletedAt,
			seriesTitle: entries.title,
			seriesDeletedAt: entries.deletedAt
		})
		.from(occurrenceNotes)
		.innerJoin(entries, eq(entries.id, occurrenceNotes.seriesId))
		.where(isNotNull(occurrenceNotes.deletedAt))
		.all();
	for (const n of notes) {
		if (n.seriesDeletedAt !== null) continue;
		items.push({
			kind: 'occurrenceNote',
			id: n.id,
			title: `${n.seriesTitle} (${n.date})`,
			deletedAt: n.deletedAt!,
			expiresAt: expiryOf(n.deletedAt!),
			ownerId: null
		});
	}

	const mediaRows = db
		.select({
			id: media.id,
			name: media.originalName,
			deletedAt: media.deletedAt,
			journalOwnerId: journalEntries.userId,
			entryDeletedAt: entries.deletedAt,
			noteDeletedAt: occurrenceNotes.deletedAt,
			journalDeletedAt: journalEntries.deletedAt,
			noteSeriesId: occurrenceNotes.seriesId
		})
		.from(media)
		.leftJoin(entries, eq(entries.id, media.entryId))
		.leftJoin(occurrenceNotes, eq(occurrenceNotes.id, media.occurrenceNoteId))
		.leftJoin(journalEntries, eq(journalEntries.id, media.journalEntryId))
		.where(isNotNull(media.deletedAt))
		.all();
	const deletedSeries = new Set(
		db
			.select({ id: entries.id })
			.from(entries)
			.where(isNotNull(entries.deletedAt))
			.all()
			.map((r) => r.id)
	);
	for (const m of mediaRows) {
		const parentDeleted =
			m.entryDeletedAt !== null ||
			m.noteDeletedAt !== null ||
			m.journalDeletedAt !== null ||
			(m.noteSeriesId !== null && deletedSeries.has(m.noteSeriesId));
		if (parentDeleted) continue;
		items.push({
			kind: 'media',
			id: m.id,
			title: m.name,
			deletedAt: m.deletedAt!,
			expiresAt: expiryOf(m.deletedAt!),
			ownerId: m.journalOwnerId
		});
	}

	return items.sort((a, b) => b.deletedAt - a.deletedAt || a.id - b.id);
}

function notFound(): HttpError {
	return new HttpError(404, 'Élément introuvable dans la corbeille.');
}

/** Journal owner of a trashed item (null when the item is not journal-related). */
function journalOwner(db: Db, kind: TrashKind, id: number): number | null {
	if (kind === 'journal') {
		return (
			db
				.select({ userId: journalEntries.userId })
				.from(journalEntries)
				.where(eq(journalEntries.id, id))
				.get()?.userId ?? null
		);
	}
	if (kind === 'media') {
		return (
			db
				.select({ userId: journalEntries.userId })
				.from(media)
				.innerJoin(journalEntries, eq(journalEntries.id, media.journalEntryId))
				.where(eq(media.id, id))
				.get()?.userId ?? null
		);
	}
	return null;
}

/** Rejects anything but a known kind (callers may forward raw client input, e.g. `__proto__`). */
function assertKind(kind: string): asserts kind is TrashKind {
	if (!(TRASH_KINDS as readonly string[]).includes(kind)) {
		throw new HttpError(400, 'Type d’élément inconnu.');
	}
}

/** 404 unless the row exists and is soft-deleted; 403 for someone else's journal content. */
function assertActionable(db: Db, kind: TrashKind, id: number, userId: number): void {
	const table = { entry: entries, occurrenceNote: occurrenceNotes, journal: journalEntries, media }[
		kind
	];
	const row = db.select({ deletedAt: table.deletedAt }).from(table).where(eq(table.id, id)).get();
	if (!row || row.deletedAt === null) throw notFound();
	const owner = journalOwner(db, kind, id);
	if (owner !== null && owner !== userId) {
		throw new HttpError(403, 'Ce contenu du journal appartient à quelqu’un d’autre.');
	}
}

function parentDeletedError(): HttpError {
	return new HttpError(409, 'Restaurez d’abord l’élément parent, encore dans la corbeille.');
}

/** True when the note's series is soft-deleted. */
function noteParentDeleted(db: Db, noteId: number): boolean {
	const row = db
		.select({ deletedAt: entries.deletedAt })
		.from(occurrenceNotes)
		.innerJoin(entries, eq(entries.id, occurrenceNotes.seriesId))
		.where(eq(occurrenceNotes.id, noteId))
		.get();
	return row?.deletedAt != null;
}

/** True when the media's owner (entry / note and its series / journal entry) is soft-deleted. */
function mediaParentDeleted(db: Db, mediaId: number): boolean {
	const row = db
		.select({
			entryDeletedAt: entries.deletedAt,
			noteDeletedAt: occurrenceNotes.deletedAt,
			noteId: occurrenceNotes.id,
			journalDeletedAt: journalEntries.deletedAt
		})
		.from(media)
		.leftJoin(entries, eq(entries.id, media.entryId))
		.leftJoin(occurrenceNotes, eq(occurrenceNotes.id, media.occurrenceNoteId))
		.leftJoin(journalEntries, eq(journalEntries.id, media.journalEntryId))
		.where(eq(media.id, mediaId))
		.get();
	if (!row) return false;
	if (row.entryDeletedAt != null || row.noteDeletedAt != null || row.journalDeletedAt != null) {
		return true;
	}
	return row.noteId !== null && noteParentDeleted(db, row.noteId);
}

/**
 * Clears `deleted_at`. Journal content: author only (403); a clashing live journal
 * day → 409; a note / media whose parent is still deleted → 409 (it would stay hidden).
 */
export function restore(db: Db, kind: string, id: number, userId: number): void {
	assertKind(kind);
	assertActionable(db, kind, id, userId);
	switch (kind) {
		case 'entry':
			db.update(entries).set({ deletedAt: null }).where(eq(entries.id, id)).run();
			return;
		case 'occurrenceNote':
			if (noteParentDeleted(db, id)) throw parentDeletedError();
			db.update(occurrenceNotes).set({ deletedAt: null }).where(eq(occurrenceNotes.id, id)).run();
			return;
		case 'media':
			if (mediaParentDeleted(db, id)) throw parentDeletedError();
			db.update(media).set({ deletedAt: null }).where(eq(media.id, id)).run();
			return;
		case 'journal': {
			const j = db.select().from(journalEntries).where(eq(journalEntries.id, id)).get()!;
			const live = db
				.select({ id: journalEntries.id })
				.from(journalEntries)
				.where(
					and(
						eq(journalEntries.userId, j.userId),
						eq(journalEntries.day, j.day),
						isNull(journalEntries.deletedAt)
					)
				)
				.get();
			if (live) {
				throw new HttpError(
					409,
					'Une entrée de journal existe déjà pour ce jour : impossible de restaurer celle-ci.'
				);
			}
			db.update(journalEntries).set({ deletedAt: null }).where(eq(journalEntries.id, id)).run();
			return;
		}
	}
}

type MediaFiles = StoredMediaFiles & { id: number };

function mediaFilesWhere(db: Db, condition: ReturnType<typeof or>): MediaFiles[] {
	return db
		.select({
			id: media.id,
			storedName: media.storedName,
			thumbName: media.thumbName,
			posterName: media.posterName
		})
		.from(media)
		.where(condition)
		.all();
}

/** All media rows living under the given owners (direct, via occurrence notes, journal). */
function collectMedia(
	db: Db,
	ids: { entries?: number[]; notes?: number[]; journal?: number[]; media?: number[] }
): MediaFiles[] {
	const noteIds = new Set(ids.notes ?? []);
	if (ids.entries?.length) {
		for (const n of db
			.select({ id: occurrenceNotes.id })
			.from(occurrenceNotes)
			.where(inArray(occurrenceNotes.seriesId, ids.entries))
			.all()) {
			noteIds.add(n.id);
		}
	}
	const conditions = [
		ids.entries?.length ? inArray(media.entryId, ids.entries) : undefined,
		noteIds.size ? inArray(media.occurrenceNoteId, [...noteIds]) : undefined,
		ids.journal?.length ? inArray(media.journalEntryId, ids.journal) : undefined,
		ids.media?.length ? inArray(media.id, ids.media) : undefined
	].filter((c) => c !== undefined);
	if (conditions.length === 0) return [];
	return mediaFilesWhere(db, or(...conditions));
}

async function unlinkAll(files: MediaFiles[]): Promise<void> {
	const results = await Promise.allSettled(files.map((f) => removeMediaFiles(f)));
	for (const r of results) {
		if (r.status === 'rejected') console.error('Suppression de fichier média échouée', r.reason);
	}
}

/**
 * Removes rows (children go through FK cascade) in one transaction, after
 * collecting the media rows beneath them, then unlinks the files.
 */
async function purgeIds(
	db: Db,
	ids: { entries?: number[]; notes?: number[]; journal?: number[]; media?: number[] }
): Promise<void> {
	const files = collectMedia(db, ids);
	db.transaction((tx) => {
		if (ids.entries?.length) tx.delete(entries).where(inArray(entries.id, ids.entries)).run();
		if (ids.notes?.length) {
			tx.delete(occurrenceNotes).where(inArray(occurrenceNotes.id, ids.notes)).run();
		}
		if (ids.journal?.length) {
			tx.delete(journalEntries).where(inArray(journalEntries.id, ids.journal)).run();
		}
		if (ids.media?.length) tx.delete(media).where(inArray(media.id, ids.media)).run();
	});
	await unlinkAll(files);
}

/** Permanently deletes one soft-deleted item, its descendants and their files. */
export async function purgeItem(db: Db, kind: string, id: number, userId: number): Promise<void> {
	assertKind(kind);
	assertActionable(db, kind, id, userId);
	const key = { entry: 'entries', occurrenceNote: 'notes', journal: 'journal', media: 'media' }[
		kind
	] as 'entries' | 'notes' | 'journal' | 'media';
	await purgeIds(db, { [key]: [id] });
}

/**
 * Purges everything soft-deleted before `now - 30 days` (rows, cascaded
 * children and files) and drops expired sessions. Returns the number of
 * directly purged rows.
 */
export async function purgeExpired(db: Db, now: number): Promise<number> {
	// Sweep sessions first so a purge failure below cannot skip it.
	db.delete(sessions).where(lte(sessions.expiresAt, now)).run();
	const cutoff = now - TRASH_RETENTION_MS;
	const ids = {
		entries: db
			.select({ id: entries.id })
			.from(entries)
			.where(and(isNotNull(entries.deletedAt), lt(entries.deletedAt, cutoff)))
			.all()
			.map((r) => r.id),
		notes: db
			.select({ id: occurrenceNotes.id })
			.from(occurrenceNotes)
			.where(and(isNotNull(occurrenceNotes.deletedAt), lt(occurrenceNotes.deletedAt, cutoff)))
			.all()
			.map((r) => r.id),
		journal: db
			.select({ id: journalEntries.id })
			.from(journalEntries)
			.where(and(isNotNull(journalEntries.deletedAt), lt(journalEntries.deletedAt, cutoff)))
			.all()
			.map((r) => r.id),
		media: db
			.select({ id: media.id })
			.from(media)
			.where(and(isNotNull(media.deletedAt), lt(media.deletedAt, cutoff)))
			.all()
			.map((r) => r.id)
	};
	await purgeIds(db, ids);
	return ids.entries.length + ids.notes.length + ids.journal.length + ids.media.length;
}

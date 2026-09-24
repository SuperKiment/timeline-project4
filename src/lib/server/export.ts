import type { Db } from './db';
import { entries, journalEntries, media, occurrenceNotes, users } from './db/schema';

export interface ExportData {
	version: 1;
	exportedAt: number;
	users: { id: number; username: string; displayName: string }[];
	entries: (typeof entries.$inferSelect)[];
	occurrenceNotes: (typeof occurrenceNotes.$inferSelect)[];
	journal: (typeof journalEntries.$inferSelect)[];
	media: (typeof media.$inferSelect)[];
}

/**
 * Full data export as a plain JSON-serializable object (FR-27). Deliberately
 * excludes `password_hash` (users) and sessions entirely; soft-deleted rows
 * are included with their `deletedAt` flag field so the export stays a
 * faithful snapshot, but no media files are read/embedded (metadata only).
 */
export function exportAll(db: Db): ExportData {
	const exportedUsers = db
		.select({ id: users.id, username: users.username, displayName: users.displayName })
		.from(users)
		.orderBy(users.id)
		.all();

	const exportedEntries = db.select().from(entries).orderBy(entries.id).all();
	const exportedOccurrenceNotes = db
		.select()
		.from(occurrenceNotes)
		.orderBy(occurrenceNotes.id)
		.all();
	const exportedJournal = db.select().from(journalEntries).orderBy(journalEntries.id).all();
	const exportedMedia = db.select().from(media).orderBy(media.id).all();

	return {
		version: 1,
		exportedAt: Date.now(),
		users: exportedUsers,
		entries: exportedEntries,
		occurrenceNotes: exportedOccurrenceNotes,
		journal: exportedJournal,
		media: exportedMedia
	};
}

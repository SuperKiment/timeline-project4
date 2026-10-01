import { and, eq, gte, isNull, lte } from 'drizzle-orm';
import { addDays, diffDays, firstDay, fromSortKey, lastDay, toSortKey } from '../../dates/fuzzy';
import type { Db } from '../db';
import { entries, journalEntries, users } from '../db/schema';
import type { EntryInput } from './validate';

export type EntryRow = typeof entries.$inferSelect;

/** A day, within an entry's period, that has visible journal entries. */
export interface JournalDayLink {
	day: string;
	authors: string[];
}

/** Journal-day lookups per entry are capped to this many days (perf guard). */
const MAX_JOURNAL_LINK_DAYS = 366;

function toColumns(input: EntryInput) {
	return {
		type: input.type,
		title: input.title,
		description: input.description,
		location: input.location,
		tags: JSON.stringify(input.tags),
		startSort: toSortKey(input.start),
		startPrecision: input.start.precision,
		endSort: input.end ? toSortKey(input.end) : null,
		endPrecision: input.end ? input.end.precision : null,
		recurrenceFreq: input.recurrenceFreq
	};
}

/** Creates a new entry (any of the 5 types), stamping `created_by`/`updated_by`. */
export function createEntry(db: Db, input: EntryInput, userId: number, now: number): EntryRow {
	return db
		.insert(entries)
		.values({
			...toColumns(input),
			createdBy: userId,
			createdAt: now,
			updatedBy: userId,
			updatedAt: now
		})
		.returning()
		.get();
}

/**
 * Updates a visible entry, stamping `updated_by`/`updated_at`. Returns `null`
 * if the entry doesn't exist or was soft-deleted.
 */
export function updateEntry(
	db: Db,
	id: number,
	input: EntryInput,
	userId: number,
	now: number
): EntryRow | null {
	if (!getEntry(db, id)) return null;

	return db
		.update(entries)
		.set({ ...toColumns(input), updatedBy: userId, updatedAt: now })
		.where(eq(entries.id, id))
		.returning()
		.get();
}

/** A visible (non-deleted) entry by id, or `null` if missing/deleted. */
export function getEntry(db: Db, id: number): EntryRow | null {
	const row = db
		.select()
		.from(entries)
		.where(and(eq(entries.id, id), isNull(entries.deletedAt)))
		.get();
	return row ?? null;
}

/**
 * Soft-deletes an entry (FR-25). Children keep their own rows (EC-5). A no-op
 * when the entry is already deleted, so the 30-day purge clock isn't reset.
 */
export function softDeleteEntry(db: Db, id: number, now: number): void {
	db.update(entries)
		.set({ deletedAt: now })
		.where(and(eq(entries.id, id), isNull(entries.deletedAt)))
		.run();
}

/**
 * Days within `entry`'s period (`[firstDay(start), lastDay(end) or today if
 * ongoing]`, capped to its most recent `MAX_JOURNAL_LINK_DAYS` days) that have visible
 * journal entries, with the display names of their authors (FR-13).
 */
export function listJournalDaysForEntry(db: Db, entry: EntryRow, today: string): JournalDayLink[] {
	let from = firstDay(fromSortKey(entry.startSort));
	const to = entry.endSort ? lastDay(fromSortKey(entry.endSort)) : today;
	if (diffDays(from, to) + 1 > MAX_JOURNAL_LINK_DAYS) {
		from = addDays(to, -(MAX_JOURNAL_LINK_DAYS - 1));
	}

	const rows = db
		.select({ day: journalEntries.day, authorName: users.displayName })
		.from(journalEntries)
		.innerJoin(users, eq(users.id, journalEntries.userId))
		.where(
			and(
				isNull(journalEntries.deletedAt),
				gte(journalEntries.day, from),
				lte(journalEntries.day, to)
			)
		)
		.orderBy(journalEntries.day)
		.all();

	const byDay = new Map<string, string[]>();
	for (const row of rows) {
		const authors = byDay.get(row.day) ?? [];
		if (!authors.includes(row.authorName)) authors.push(row.authorName);
		byDay.set(row.day, authors);
	}

	return [...byDay.entries()].map(([day, authors]) => ({ day, authors }));
}

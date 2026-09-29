import { and, asc, eq, gte, isNull, lte } from 'drizzle-orm';
import { isValidFuzzy, parseIsoDay } from '../../dates/fuzzy';
import { isValidMood } from '../../journal/moods';
import type { Db } from '../db';
import { journalEntries, users } from '../db/schema';
import { HttpError } from '../http-error';
import { isFutureDay } from '../time';

const ISO_DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Validates `day` as a real calendar date `YYYY-MM-DD`. Throws 400 otherwise. */
export function assertValidDay(day: string): void {
	if (!ISO_DAY_RE.test(day) || !isValidFuzzy({ ...parseIsoDay(day), precision: 'day' })) {
		throw new HttpError(400, 'Date invalide.');
	}
}

export interface JournalDayEntry {
	id: number;
	userId: number;
	authorName: string;
	text: string;
	mood: string | null;
	createdAt: number;
	updatedAt: number;
}

export interface JournalDay {
	day: string;
	isFuture: boolean;
	entries: JournalDayEntry[];
}

export interface JournalEntryInput {
	text: string;
	mood?: string | null;
}

export interface CalendarDay {
	day: string;
	authors: { userId: number; displayName: string }[];
}

/** Max journal text length, in characters. */
export const MAX_TEXT_LENGTH = 50_000;

function assertValidText(text: string): void {
	if (text.length > MAX_TEXT_LENGTH) {
		throw new HttpError(400, 'Texte trop long (50 000 caractères max).');
	}
}

function assertValidMood(mood: string | null | undefined): void {
	if (mood != null && !isValidMood(mood)) {
		throw new HttpError(400, 'Humeur invalide.');
	}
}

/**
 * Both users' visible (non-deleted) journal entries for `day`, with author
 * display names, plus whether `day` is in the future relative to `tz`/`now`.
 */
export function getDay(db: Db, day: string, tz: string, now = Date.now()): JournalDay {
	assertValidDay(day);

	const entries = db
		.select({
			id: journalEntries.id,
			userId: journalEntries.userId,
			authorName: users.displayName,
			text: journalEntries.text,
			mood: journalEntries.mood,
			createdAt: journalEntries.createdAt,
			updatedAt: journalEntries.updatedAt
		})
		.from(journalEntries)
		.innerJoin(users, eq(users.id, journalEntries.userId))
		.where(and(eq(journalEntries.day, day), isNull(journalEntries.deletedAt)))
		.orderBy(asc(journalEntries.userId))
		.all();

	return { day, isFuture: isFutureDay(day, tz, new Date(now)), entries };
}

/**
 * Creates or updates the current user's own journal entry for `day` (one
 * non-deleted row per user per day, enforced by a partial unique index).
 * Rejects future days and invalid moods.
 */
export function upsertOwnEntry(
	db: Db,
	userId: number,
	day: string,
	input: JournalEntryInput,
	tz: string,
	now = Date.now()
): number {
	assertValidDay(day);
	if (isFutureDay(day, tz, new Date(now))) {
		throw new HttpError(400, "Impossible d'écrire dans le journal pour un jour futur.");
	}
	assertValidText(input.text);
	assertValidMood(input.mood);

	const ts = now;
	const mood = input.mood ?? null;

	const existing = db
		.select({ id: journalEntries.id })
		.from(journalEntries)
		.where(
			and(
				eq(journalEntries.userId, userId),
				eq(journalEntries.day, day),
				isNull(journalEntries.deletedAt)
			)
		)
		.get();

	if (existing) {
		db.update(journalEntries)
			.set({ text: input.text, mood, updatedAt: ts })
			.where(eq(journalEntries.id, existing.id))
			.run();
		return existing.id;
	}

	const created = db
		.insert(journalEntries)
		.values({ userId, day, text: input.text, mood, createdAt: ts, updatedAt: ts })
		.returning({ id: journalEntries.id })
		.get();
	return created.id;
}

function requireOwnEntry(db: Db, id: number, userId: number): void {
	const row = db
		.select({ userId: journalEntries.userId })
		.from(journalEntries)
		.where(and(eq(journalEntries.id, id), isNull(journalEntries.deletedAt)))
		.get();
	if (!row) {
		throw new HttpError(404, 'Entrée de journal introuvable.');
	}
	if (row.userId !== userId) {
		throw new HttpError(403, 'Vous ne pouvez modifier que vos propres entrées de journal.');
	}
}

/** Updates a journal entry by id. Throws 403 when `userId` is not its author. */
export function updateEntryById(
	db: Db,
	id: number,
	userId: number,
	input: JournalEntryInput,
	now = Date.now()
): void {
	assertValidText(input.text);
	assertValidMood(input.mood);
	requireOwnEntry(db, id, userId);

	db.update(journalEntries)
		.set({ text: input.text, mood: input.mood ?? null, updatedAt: now })
		.where(eq(journalEntries.id, id))
		.run();
}

/** Soft-deletes a journal entry by id. Throws 403 when `userId` is not its author. */
export function softDeleteJournal(db: Db, id: number, userId: number, now = Date.now()): void {
	requireOwnEntry(db, id, userId);

	db.update(journalEntries).set({ deletedAt: now }).where(eq(journalEntries.id, id)).run();
}

/**
 * Soft-deletes the caller's own live entry for `day`. Throws 404 when the
 * caller has none that day (or `day` is invalid → 400).
 */
export function softDeleteOwnDay(db: Db, userId: number, day: string, now = Date.now()): void {
	assertValidDay(day);

	const own = db
		.select({ id: journalEntries.id })
		.from(journalEntries)
		.where(
			and(
				eq(journalEntries.userId, userId),
				eq(journalEntries.day, day),
				isNull(journalEntries.deletedAt)
			)
		)
		.get();
	if (!own) {
		throw new HttpError(404, 'Entrée de journal introuvable.');
	}

	db.update(journalEntries).set({ deletedAt: now }).where(eq(journalEntries.id, own.id)).run();
}

/**
 * Visible journal entries between `fromDay` and `toDay` (inclusive), grouped
 * by day with the authors who wrote that day — for the calendar view.
 */
export function listCalendar(db: Db, fromDay: string, toDay: string): CalendarDay[] {
	assertValidDay(fromDay);
	assertValidDay(toDay);

	const rows = db
		.select({
			day: journalEntries.day,
			userId: journalEntries.userId,
			displayName: users.displayName
		})
		.from(journalEntries)
		.innerJoin(users, eq(users.id, journalEntries.userId))
		.where(
			and(
				gte(journalEntries.day, fromDay),
				lte(journalEntries.day, toDay),
				isNull(journalEntries.deletedAt)
			)
		)
		.orderBy(asc(journalEntries.day), asc(journalEntries.userId))
		.all();

	const byDay = new Map<string, CalendarDay>();
	for (const row of rows) {
		let entry = byDay.get(row.day);
		if (!entry) {
			entry = { day: row.day, authors: [] };
			byDay.set(row.day, entry);
		}
		entry.authors.push({ userId: row.userId, displayName: row.displayName });
	}
	return [...byDay.values()];
}

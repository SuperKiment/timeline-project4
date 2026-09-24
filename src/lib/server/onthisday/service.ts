/**
 * "Ce jour-là" ("On this day"): for a given calendar day, everything that
 * happened on the same month/day in past years — souvenirs/important
 * memories, recurrent series occurrences, and journal entries.
 */

import { and, eq, inArray, isNull } from 'drizzle-orm';
import { isValidFuzzy } from '../../dates/fuzzy';
import { occurrenceOn, type Frequency } from '../../dates/recurrence';
import type { EntryType } from '../../timeline/types';
import type { Db } from '../db';
import { entries, journalEntries, occurrenceNotes, users } from '../db/schema';
import { monthDay } from '../time';

/** Journal excerpts are truncated to this many characters (+ ellipsis). */
const EXCERPT_LENGTH = 140;

export type OnThisDayItem =
	| { kind: 'entry'; id: number; type: Extract<EntryType, 'souvenir' | 'important'>; title: string }
	| { kind: 'occurrence'; seriesId: number; date: string; title: string; note: string | null }
	| { kind: 'journal'; day: string; author: string; excerpt: string };

export interface OnThisDayYear {
	year: number;
	items: OnThisDayItem[];
}

function excerptOf(text: string): string {
	const trimmed = text.trim();
	if (trimmed.length <= EXCERPT_LENGTH) return trimmed;
	return `${trimmed.slice(0, EXCERPT_LENGTH).trimEnd()}…`;
}

/**
 * Everything landing on `today`'s month/day in years strictly before the
 * current one, grouped by year descending. `today` is an ISO day (`YYYY-MM-DD`),
 * typically `todayIn(tz)`.
 */
export function onThisDay(db: Db, today: string): OnThisDayYear[] {
	const currentYear = Number(today.slice(0, 4));
	const todayMonthDay = monthDay(today);
	const [month, day] = todayMonthDay.split('-').map(Number);

	const byYear = new Map<number, OnThisDayItem[]>();
	function addItem(year: number, item: OnThisDayItem): void {
		if (year >= currentYear) return;
		let items = byYear.get(year);
		if (!items) {
			items = [];
			byYear.set(year, items);
		}
		items.push(item);
	}

	// Visible souvenir/important entries with day precision, same month/day.
	const dayEntries = db
		.select({
			id: entries.id,
			type: entries.type,
			title: entries.title,
			startSort: entries.startSort
		})
		.from(entries)
		.where(
			and(
				isNull(entries.deletedAt),
				eq(entries.startPrecision, 'day'),
				inArray(entries.type, ['souvenir', 'important'])
			)
		)
		.all();

	for (const entry of dayEntries) {
		if (monthDay(entry.startSort) !== todayMonthDay) continue;
		addItem(Number(entry.startSort.slice(0, 4)), {
			kind: 'entry',
			id: entry.id,
			type: entry.type as Extract<EntryType, 'souvenir' | 'important'>,
			title: entry.title
		});
	}

	// Visible recurrent series: check every past year for an occurrence on
	// today's month/day.
	const recurrentSeries = db
		.select({
			id: entries.id,
			title: entries.title,
			startSort: entries.startSort,
			endSort: entries.endSort,
			recurrenceFreq: entries.recurrenceFreq
		})
		.from(entries)
		.where(and(isNull(entries.deletedAt), eq(entries.type, 'recurrent')))
		.all();

	const seriesIds = recurrentSeries.map((s) => s.id);
	const notesBySeriesAndDate = new Map<string, string | null>();
	if (seriesIds.length > 0) {
		const notes = db
			.select({
				seriesId: occurrenceNotes.seriesId,
				occurrenceDate: occurrenceNotes.occurrenceDate,
				note: occurrenceNotes.note
			})
			.from(occurrenceNotes)
			.where(and(isNull(occurrenceNotes.deletedAt), inArray(occurrenceNotes.seriesId, seriesIds)))
			.all();
		for (const note of notes) {
			notesBySeriesAndDate.set(`${note.seriesId}|${note.occurrenceDate}`, note.note);
		}
	}

	for (const series of recurrentSeries) {
		if (!series.recurrenceFreq) continue;
		const originYear = Number(series.startSort.slice(0, 4));
		for (let year = originYear; year < currentYear; year++) {
			if (!isValidFuzzy({ year, month, day, precision: 'day' })) continue;
			const candidate = `${String(year).padStart(4, '0')}-${todayMonthDay}`;
			if (
				!occurrenceOn(
					series.startSort,
					series.recurrenceFreq as Frequency,
					candidate,
					series.endSort
				)
			) {
				continue;
			}
			addItem(year, {
				kind: 'occurrence',
				seriesId: series.id,
				date: candidate,
				title: series.title,
				note: notesBySeriesAndDate.get(`${series.id}|${candidate}`) ?? null
			});
		}
	}

	// Visible journal entries with the same month/day.
	const journalRows = db
		.select({
			day: journalEntries.day,
			text: journalEntries.text,
			author: users.displayName
		})
		.from(journalEntries)
		.innerJoin(users, eq(journalEntries.userId, users.id))
		.where(isNull(journalEntries.deletedAt))
		.all();

	for (const row of journalRows) {
		if (monthDay(row.day) !== todayMonthDay) continue;
		addItem(Number(row.day.slice(0, 4)), {
			kind: 'journal',
			day: row.day,
			author: row.author,
			excerpt: excerptOf(row.text)
		});
	}

	return [...byYear.entries()]
		.sort((a, b) => b[0] - a[0])
		.map(([year, items]) => ({ year, items }));
}

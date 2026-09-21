/**
 * Recurrence occurrence generator for `recurrent` timeline entries.
 * Pure functions: no Node APIs, no I/O. Dates are plain ISO strings `YYYY-MM-DD`.
 */

import { daysInMonth, isoDay, parseIsoDay } from './fuzzy';

export type Frequency = 'yearly' | 'monthly';

/** Safety cap on generated occurrences to avoid runaway loops on malformed input. */
const MAX_OCCURRENCES = 20000;

/** Day-of-month clamped to the last real day of `year`/`month` (e.g. 31 -> 30/28/29). */
function clampDay(day: number, year: number, month: number): number {
	return Math.min(day, daysInMonth(year, month));
}

/**
 * Generates occurrence dates for a recurring series, inclusive of `originIso`,
 * up to and including `min(endIso, untilIso)`. Returns `[]` when that bound is
 * before `originIso`.
 */
export function occurrences(
	originIso: string,
	freq: Frequency,
	endIso: string | null,
	untilIso: string
): string[] {
	const origin = parseIsoDay(originIso);
	const result: string[] = [];

	const limit = endIso !== null && endIso < untilIso ? endIso : untilIso;

	if (limit < originIso) {
		return result;
	}

	for (let offset = 0; offset < MAX_OCCURRENCES; offset++) {
		let iso: string;

		if (freq === 'yearly') {
			const year = origin.year + offset;
			const day = clampDay(origin.day, year, origin.month);
			iso = isoDay(year, origin.month, day);
		} else {
			const totalMonths = origin.month - 1 + offset;
			const year = origin.year + Math.floor(totalMonths / 12);
			const month = (totalMonths % 12) + 1;
			const day = clampDay(origin.day, year, month);
			iso = isoDay(year, month, day);
		}

		if (iso > limit) {
			break;
		}
		result.push(iso);
	}

	return result;
}

/**
 * Whether the series starting at `originIso` (frequency `freq`, optional end `endIso`)
 * has an occurrence landing exactly on `dayIso`. Used for "Ce jour-là".
 */
export function occurrenceOn(
	originIso: string,
	freq: Frequency,
	dayIso: string,
	endIso: string | null
): boolean {
	if (dayIso < originIso) {
		return false;
	}
	if (endIso !== null && dayIso > endIso) {
		return false;
	}

	const origin = parseIsoDay(originIso);
	const target = parseIsoDay(dayIso);

	if (freq === 'yearly') {
		if (target.month !== origin.month) {
			return false;
		}
		return target.day === clampDay(origin.day, target.year, origin.month);
	}

	return target.day === clampDay(origin.day, target.year, target.month);
}

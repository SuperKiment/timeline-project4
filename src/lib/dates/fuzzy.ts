/**
 * Fuzzy date handling: a date known only to the year, the month or the day.
 * Pure functions, no Node APIs — safe to import from anywhere (client or server).
 */

export const PRECISIONS = ['day', 'month', 'year'] as const;
export type Precision = (typeof PRECISIONS)[number];

export interface FuzzyDate {
	year: number;
	month?: number;
	day?: number;
	precision: Precision;
}

export const FRENCH_MONTHS = [
	'janvier',
	'février',
	'mars',
	'avril',
	'mai',
	'juin',
	'juillet',
	'août',
	'septembre',
	'octobre',
	'novembre',
	'décembre'
];

function pad2(n: number): string {
	return String(n).padStart(2, '0');
}

function pad4(n: number): string {
	return String(n).padStart(4, '0');
}

/**
 * Formats an ISO day string `YYYY-MM-DD` from numeric parts. The single ISO
 * formatter shared by this module and `recurrence.ts` — `month`/`day` of `0`
 * are allowed (used by `toSortKey`-style callers) and simply zero-pad.
 */
export function isoDay(year: number, month: number, day: number): string {
	return `${pad4(year)}-${pad2(month)}-${pad2(day)}`;
}

/**
 * Number of days in `month` (1-12) of `year`, leap years included.
 * Uses `setUTCFullYear` (not `Date.UTC`/the two-arg `Date` constructor) so that
 * years 0-99 are kept as-is instead of being remapped to 1900-1999.
 */
export function daysInMonth(year: number, month: number): number {
	const d = new Date(0);
	d.setUTCFullYear(year, month, 0);
	return d.getUTCDate();
}

/**
 * Validates a FuzzyDate against its declared precision: fields must be
 * present/absent consistently and, when present, denote a real calendar date.
 */
export function isValidFuzzy(fd: FuzzyDate): boolean {
	if (!Number.isInteger(fd.year) || fd.year < 1 || fd.year > 9999) return false;

	if (fd.precision === 'year') {
		return fd.month === undefined && fd.day === undefined;
	}

	if (fd.precision === 'month') {
		if (fd.day !== undefined) return false;
		return fd.month !== undefined && Number.isInteger(fd.month) && fd.month >= 1 && fd.month <= 12;
	}

	// precision === 'day'
	if (fd.month === undefined || fd.day === undefined) return false;
	if (!Number.isInteger(fd.month) || fd.month < 1 || fd.month > 12) return false;
	if (!Number.isInteger(fd.day) || fd.day < 1) return false;
	return fd.day <= daysInMonth(fd.year, fd.month);
}

/**
 * Lexicographically sortable key: `YYYY-00-00` (year), `YYYY-MM-00` (month),
 * `YYYY-MM-DD` (day). String comparison of keys satisfies EC-3 ordering.
 */
export function toSortKey(fd: FuzzyDate): string {
	const month = fd.precision === 'year' ? 0 : (fd.month ?? 0);
	const day = fd.precision === 'day' ? (fd.day ?? 0) : 0;
	return isoDay(fd.year, month, day);
}

/** Inverse of `toSortKey`: precision is inferred from trailing `00` segments. */
export function fromSortKey(key: string): FuzzyDate {
	const [yearStr, monthStr, dayStr] = key.split('-');
	const year = Number(yearStr);
	const month = Number(monthStr);
	const day = Number(dayStr);

	if (day !== 0) {
		return { year, month, day, precision: 'day' };
	}
	if (month !== 0) {
		return { year, month, precision: 'month' };
	}
	return { year, precision: 'year' };
}

/** Earliest ISO day (`YYYY-MM-DD`) covered by a fuzzy date. */
export function firstDay(fd: FuzzyDate): string {
	const month = fd.precision === 'year' ? 1 : (fd.month ?? 1);
	const day = fd.precision === 'day' ? (fd.day ?? 1) : 1;
	return isoDay(fd.year, month, day);
}

/** Latest ISO day (`YYYY-MM-DD`) covered by a fuzzy date. */
export function lastDay(fd: FuzzyDate): string {
	if (fd.precision === 'day') {
		return isoDay(fd.year, fd.month ?? 1, fd.day ?? 1);
	}
	if (fd.precision === 'month') {
		const month = fd.month ?? 1;
		return isoDay(fd.year, month, daysInMonth(fd.year, month));
	}
	return isoDay(fd.year, 12, 31);
}

/** Compares two sort keys; result has the sign of `a - b` in chronological order. */
export function compareSortKeys(a: string, b: string): number {
	if (a < b) return -1;
	if (a > b) return 1;
	return 0;
}

/** French display: "12 mars 2018" / "mars 2018" / "2018". */
export function formatFr(fd: FuzzyDate): string {
	if (fd.precision === 'day') {
		return `${fd.day} ${FRENCH_MONTHS[(fd.month ?? 1) - 1]} ${fd.year}`;
	}
	if (fd.precision === 'month') {
		return `${FRENCH_MONTHS[(fd.month ?? 1) - 1]} ${fd.year}`;
	}
	return `${fd.year}`;
}

/**
 * French display of a period: "mars 2018 – 2020", "mars 2018 – en cours" (EC-1,
 * `ongoing` and no end), or just the start when there is no distinct end.
 */
export function formatPeriodFr(start: FuzzyDate, end: FuzzyDate | null, ongoing = false): string {
	const from = formatFr(start);
	if (!end) return ongoing ? `${from} – en cours` : from;
	const to = formatFr(end);
	return to === from ? from : `${from} – ${to}`;
}

/** French day+month display of an ISO day, no year: "21 septembre". */
export function formatDayMonthFr(isoDayStr: string): string {
	const [, monthStr, dayStr] = isoDayStr.split('-');
	return `${Number(dayStr)} ${FRENCH_MONTHS[Number(monthStr) - 1]}`;
}

/**
 * A period is valid when it has no end (ongoing) or when its end does not
 * finish before its start began (per Conventions: refuse `lastDay(end) < firstDay(start)`).
 */
export function isPeriodValid(start: FuzzyDate, end: FuzzyDate | null): boolean {
	if (!end) return true;
	return compareSortKeys(lastDay(end), firstDay(start)) >= 0;
}

export function parseIsoDay(isoDayStr: string): { year: number; month: number; day: number } {
	const [year, month, day] = isoDayStr.split('-').map(Number);
	return { year, month, day };
}

/** UTC milliseconds at midnight of an ISO day; years 0-99 are not remapped. */
function toUtcMillis(year: number, month: number, day: number): number {
	const d = new Date(0);
	d.setUTCFullYear(year, month - 1, day);
	return d.getTime();
}

/** Adds `n` days (may be negative) to an ISO day, using UTC arithmetic. */
export function addDays(fromIso: string, n: number): string {
	const { year, month, day } = parseIsoDay(fromIso);
	const d = new Date(toUtcMillis(year, month, day));
	d.setUTCDate(d.getUTCDate() + n);
	return isoDay(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

/** Difference in whole days from `a` to `b` (`b - a`), using UTC arithmetic. */
export function diffDays(a: string, b: string): number {
	const pa = parseIsoDay(a);
	const pb = parseIsoDay(b);
	const msPerDay = 24 * 60 * 60 * 1000;
	return Math.round(
		(toUtcMillis(pb.year, pb.month, pb.day) - toUtcMillis(pa.year, pa.month, pa.day)) / msPerDay
	);
}

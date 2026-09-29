import { daysInMonth, formatFr, isoDay } from '../dates/fuzzy';

/** A calendar month (`month` is 1-12). */
export interface YearMonth {
	year: number;
	month: number;
}

const MONTH_PARAM_RE = /^(\d{4})-(\d{2})$/;

/**
 * Parses a `?mois=YYYY-MM` value. Returns `null` when missing or invalid
 * (bad format, month outside 01-12, year 0000).
 */
export function parseMonthParam(value: string | null | undefined): YearMonth | null {
	if (!value) return null;
	const match = MONTH_PARAM_RE.exec(value);
	if (!match) return null;
	const year = Number(match[1]);
	const month = Number(match[2]);
	if (year < 1 || month < 1 || month > 12) return null;
	return { year, month };
}

/** Formats a month as `YYYY-MM` (the `?mois=` value). */
export function formatMonthParam({ year, month }: YearMonth): string {
	return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}`;
}

/** Month containing the ISO day `YYYY-MM-DD`. */
export function monthOfDay(day: string): YearMonth {
	return { year: Number(day.slice(0, 4)), month: Number(day.slice(5, 7)) };
}

/** Month `delta` months away from `ym` (negative = earlier), crossing years. */
export function shiftMonth({ year, month }: YearMonth, delta: number): YearMonth {
	const index = year * 12 + (month - 1) + delta;
	return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

/** French label such as `septembre 2026`. */
export function monthLabel({ year, month }: YearMonth): string {
	return formatFr({ year, month, precision: 'month' });
}

/** First and last ISO day of the month. */
export function monthRange({ year, month }: YearMonth): { from: string; to: string } {
	return { from: isoDay(year, month, 1), to: isoDay(year, month, daysInMonth(year, month)) };
}

/**
 * Month grid with weeks starting on Monday. Each week has 7 slots holding the
 * ISO day, or `null` for padding cells outside the month.
 */
export function buildMonthGrid({ year, month }: YearMonth): (string | null)[][] {
	const first = new Date(0);
	first.setUTCFullYear(year, month - 1, 1);
	const offset = (first.getUTCDay() + 6) % 7; // Monday = 0
	const total = daysInMonth(year, month);

	const slots: (string | null)[] = Array<null>(offset).fill(null);
	for (let d = 1; d <= total; d++) slots.push(isoDay(year, month, d));
	while (slots.length % 7 !== 0) slots.push(null);

	const weeks: (string | null)[][] = [];
	for (let i = 0; i < slots.length; i += 7) weeks.push(slots.slice(i, i + 7));
	return weeks;
}

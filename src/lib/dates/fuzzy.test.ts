import { describe, expect, it } from 'vitest';
import {
	addDays,
	compareSortKeys,
	daysInMonth,
	diffDays,
	firstDay,
	formatDayMonthFr,
	formatFr,
	formatPeriodFr,
	fromSortKey,
	isPeriodValid,
	isValidFuzzy,
	isoDay,
	lastDay,
	toSortKey,
	type FuzzyDate
} from './fuzzy';

describe('daysInMonth', () => {
	it('handles leap years', () => {
		expect(daysInMonth(2024, 2)).toBe(29);
		expect(daysInMonth(2023, 2)).toBe(28);
	});

	it('handles short/long months', () => {
		expect(daysInMonth(2024, 1)).toBe(31);
		expect(daysInMonth(2024, 4)).toBe(30);
	});

	it('is correct for two-digit years (no 1900 remapping)', () => {
		// Year 4 is a leap year (4 % 4 === 0, 4 % 100 !== 0), same as year 50 is not.
		expect(daysInMonth(4, 2)).toBe(29);
		expect(daysInMonth(50, 2)).toBe(28);
	});
});

describe('isoDay', () => {
	it('formats numeric parts, zero-padded', () => {
		expect(isoDay(2018, 3, 12)).toBe('2018-03-12');
		expect(isoDay(2018, 0, 0)).toBe('2018-00-00');
	});
});

describe('isValidFuzzy', () => {
	it.each<[string, FuzzyDate]>([
		['day precision, including leap day', { year: 2024, month: 2, day: 29, precision: 'day' }],
		['month precision', { year: 2019, month: 6, precision: 'month' }],
		['year precision', { year: 2018, precision: 'year' }],
		['year lower bound 1', { year: 1, precision: 'year' }],
		['year upper bound 9999', { year: 9999, precision: 'year' }]
	])('accepts %s', (_name, date) => {
		expect(isValidFuzzy(date)).toBe(true);
	});

	it.each<[string, Partial<FuzzyDate>]>([
		['an invalid leap day', { year: 2023, month: 2, day: 29, precision: 'day' }],
		['an out-of-range month', { year: 2018, month: 13, day: 1, precision: 'day' }],
		['an out-of-range day', { year: 2018, month: 4, day: 31, precision: 'day' }],
		['day precision missing day', { year: 2018, month: 4, precision: 'day' }],
		['month precision carrying a day', { year: 2019, month: 6, day: 1, precision: 'month' }],
		['year precision carrying a month', { year: 2018, month: 3, precision: 'year' }],
		['a non-integer year', { year: 2018.5, precision: 'year' }],
		['a year of 0', { year: 0, precision: 'year' }],
		['a negative year', { year: -1, precision: 'year' }],
		['a year above 9999', { year: 10000, precision: 'year' }]
	])('rejects %s', (_name, date) => {
		expect(isValidFuzzy(date as FuzzyDate)).toBe(false);
	});
});

describe('toSortKey / fromSortKey', () => {
	it('round-trips day precision', () => {
		const fd: FuzzyDate = { year: 2018, month: 3, day: 12, precision: 'day' };
		expect(toSortKey(fd)).toBe('2018-03-12');
		expect(fromSortKey(toSortKey(fd))).toEqual(fd);
	});

	it('round-trips month precision', () => {
		const fd: FuzzyDate = { year: 2018, month: 3, precision: 'month' };
		expect(toSortKey(fd)).toBe('2018-03-00');
		expect(fromSortKey(toSortKey(fd))).toEqual(fd);
	});

	it('round-trips year precision', () => {
		const fd: FuzzyDate = { year: 2018, precision: 'year' };
		expect(toSortKey(fd)).toBe('2018-00-00');
		expect(fromSortKey(toSortKey(fd))).toEqual(fd);
	});
});

describe('EC-3 ordering', () => {
	it('sorts "2018" < "mars 2018" < "12/03/2018"', () => {
		const year = toSortKey({ year: 2018, precision: 'year' });
		const month = toSortKey({ year: 2018, month: 3, precision: 'month' });
		const day = toSortKey({ year: 2018, month: 3, day: 12, precision: 'day' });
		expect(compareSortKeys(year, month)).toBeLessThan(0);
		expect(compareSortKeys(month, day)).toBeLessThan(0);
		expect(compareSortKeys(year, day)).toBeLessThan(0);
	});

	it('is symmetric and reflexive', () => {
		const a = toSortKey({ year: 2020, precision: 'year' });
		const b = toSortKey({ year: 2019, precision: 'year' });
		expect(compareSortKeys(a, b)).toBeGreaterThan(0);
		expect(compareSortKeys(b, a)).toBeLessThan(0);
		expect(compareSortKeys(a, a)).toBe(0);
	});
});

describe('firstDay / lastDay', () => {
	it('covers the whole year for year precision', () => {
		const fd: FuzzyDate = { year: 2018, precision: 'year' };
		expect(firstDay(fd)).toBe('2018-01-01');
		expect(lastDay(fd)).toBe('2018-12-31');
	});

	it('covers the whole month for month precision, leap year included', () => {
		const feb2024: FuzzyDate = { year: 2024, month: 2, precision: 'month' };
		expect(firstDay(feb2024)).toBe('2024-02-01');
		expect(lastDay(feb2024)).toBe('2024-02-29');

		const feb2023: FuzzyDate = { year: 2023, month: 2, precision: 'month' };
		expect(lastDay(feb2023)).toBe('2023-02-28');
	});

	it('firstDay equals lastDay for day precision', () => {
		const fd: FuzzyDate = { year: 2018, month: 3, day: 12, precision: 'day' };
		expect(firstDay(fd)).toBe('2018-03-12');
		expect(lastDay(fd)).toBe('2018-03-12');
	});
});

describe('formatFr', () => {
	it('formats day precision', () => {
		expect(formatFr({ year: 2018, month: 3, day: 12, precision: 'day' })).toBe('12 mars 2018');
	});

	it('formats month precision', () => {
		expect(formatFr({ year: 2018, month: 3, precision: 'month' })).toBe('mars 2018');
	});

	it('formats year precision', () => {
		expect(formatFr({ year: 2018, precision: 'year' })).toBe('2018');
	});
});

describe('formatDayMonthFr', () => {
	it('formats an ISO day as "DD month", no year', () => {
		expect(formatDayMonthFr('2026-09-21')).toBe('21 septembre');
	});

	it('drops leading zero on single-digit days', () => {
		expect(formatDayMonthFr('2018-03-05')).toBe('5 mars');
	});
});

describe('isPeriodValid', () => {
	it('accepts an ongoing period (no end)', () => {
		expect(isPeriodValid({ year: 2020, precision: 'year' }, null)).toBe(true);
	});

	it('accepts end after start', () => {
		expect(
			isPeriodValid({ year: 2020, precision: 'year' }, { year: 2022, precision: 'year' })
		).toBe(true);
	});

	it('accepts equal start and end day', () => {
		const day: FuzzyDate = { year: 2020, month: 1, day: 1, precision: 'day' };
		expect(isPeriodValid(day, day)).toBe(true);
	});

	it('rejects end before start (EC-2)', () => {
		expect(
			isPeriodValid({ year: 2022, precision: 'year' }, { year: 2020, precision: 'year' })
		).toBe(false);
	});
});

describe('addDays', () => {
	it('adds days within a month', () => {
		expect(addDays('2024-01-01', 5)).toBe('2024-01-06');
	});

	it('crosses a month boundary, leap year included', () => {
		expect(addDays('2024-02-28', 1)).toBe('2024-02-29');
		expect(addDays('2024-02-29', 1)).toBe('2024-03-01');
	});

	it('crosses a year boundary', () => {
		expect(addDays('2024-12-31', 1)).toBe('2025-01-01');
	});

	it('supports negative offsets', () => {
		expect(addDays('2024-03-01', -1)).toBe('2024-02-29');
	});
});

describe('diffDays', () => {
	it('is 0 for the same day', () => {
		expect(diffDays('2024-01-01', '2024-01-01')).toBe(0);
	});

	it('counts whole days between two ISO days, b - a', () => {
		expect(diffDays('2024-01-01', '2024-01-06')).toBe(5);
		expect(diffDays('2024-01-06', '2024-01-01')).toBe(-5);
	});

	it('is consistent across a leap-day and a year boundary', () => {
		expect(diffDays('2024-02-28', '2024-03-01')).toBe(2);
		expect(diffDays('2024-12-31', '2025-01-01')).toBe(1);
	});
});

describe('formatPeriodFr', () => {
	const start = { year: 2018, month: 3, precision: 'month' } as const;

	it('shows only the start without end', () => {
		expect(formatPeriodFr(start, null)).toBe('mars 2018');
	});

	it('shows "en cours" for an ongoing open period (EC-1)', () => {
		expect(formatPeriodFr(start, null, true)).toBe('mars 2018 – en cours');
	});

	it('shows start – end, collapsing identical bounds', () => {
		expect(formatPeriodFr(start, { year: 2020, precision: 'year' })).toBe('mars 2018 – 2020');
		expect(formatPeriodFr(start, start)).toBe('mars 2018');
	});

	it('shows the end when ongoing is set but an end exists (end wins, no "en cours")', () => {
		expect(formatPeriodFr(start, { year: 2020, precision: 'year' }, true)).toBe('mars 2018 – 2020');
	});

	it('does not validate ordering: a start after the end is rendered as given', () => {
		expect(formatPeriodFr({ year: 2022, precision: 'year' }, start)).toBe('2022 – mars 2018');
	});
});

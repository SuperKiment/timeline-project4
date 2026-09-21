import { describe, expect, it } from 'vitest';
import {
	addDays,
	compareSortKeys,
	containsDay,
	daysInMonth,
	diffDays,
	firstDay,
	formatDayMonthFr,
	formatFr,
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
	it('accepts a valid day precision date, including leap day', () => {
		expect(isValidFuzzy({ year: 2024, month: 2, day: 29, precision: 'day' })).toBe(true);
	});

	it('rejects an invalid leap day', () => {
		expect(isValidFuzzy({ year: 2023, month: 2, day: 29, precision: 'day' })).toBe(false);
	});

	it('rejects an out-of-range month', () => {
		expect(isValidFuzzy({ year: 2018, month: 13, day: 1, precision: 'day' })).toBe(false);
	});

	it('rejects an out-of-range day', () => {
		expect(isValidFuzzy({ year: 2018, month: 4, day: 31, precision: 'day' })).toBe(false);
	});

	it('rejects day precision missing day/month', () => {
		expect(isValidFuzzy({ year: 2018, month: 4, precision: 'day' })).toBe(false);
	});

	it('accepts a valid month precision date', () => {
		expect(isValidFuzzy({ year: 2019, month: 6, precision: 'month' })).toBe(true);
	});

	it('rejects month precision carrying a day', () => {
		expect(isValidFuzzy({ year: 2019, month: 6, day: 1, precision: 'month' })).toBe(false);
	});

	it('accepts a valid year precision date', () => {
		expect(isValidFuzzy({ year: 2018, precision: 'year' })).toBe(true);
	});

	it('rejects year precision carrying a month', () => {
		expect(isValidFuzzy({ year: 2018, month: 3, precision: 'year' })).toBe(false);
	});

	it('rejects a non-integer year', () => {
		expect(isValidFuzzy({ year: 2018.5, precision: 'year' })).toBe(false);
	});

	it('accepts the year bounds 1 and 9999', () => {
		expect(isValidFuzzy({ year: 1, precision: 'year' })).toBe(true);
		expect(isValidFuzzy({ year: 9999, precision: 'year' })).toBe(true);
	});

	it('rejects a year of 0, negative years, and years above 9999', () => {
		expect(isValidFuzzy({ year: 0, precision: 'year' })).toBe(false);
		expect(isValidFuzzy({ year: -1, precision: 'year' })).toBe(false);
		expect(isValidFuzzy({ year: 10000, precision: 'year' })).toBe(false);
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

describe('containsDay', () => {
	const start: FuzzyDate = { year: 2020, month: 1, day: 1, precision: 'day' };
	const end: FuzzyDate = { year: 2020, month: 6, day: 30, precision: 'day' };

	it('includes days within a bounded period', () => {
		expect(containsDay(start, end, '2020-03-15', '2021-01-01')).toBe(true);
	});

	it('excludes days outside a bounded period', () => {
		expect(containsDay(start, end, '2020-07-01', '2021-01-01')).toBe(false);
	});

	it('treats a null end as ongoing up to today', () => {
		expect(containsDay(start, null, '2021-01-01', '2021-01-01')).toBe(true);
		expect(containsDay(start, null, '2021-01-02', '2021-01-01')).toBe(false);
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

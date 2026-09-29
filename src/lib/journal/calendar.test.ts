import { describe, expect, it } from 'vitest';
import {
	buildMonthGrid,
	formatMonthParam,
	monthLabel,
	monthOfDay,
	monthRange,
	parseMonthParam,
	shiftMonth
} from './calendar';

describe('parseMonthParam', () => {
	it('parses valid values', () => {
		expect(parseMonthParam('2026-09')).toEqual({ year: 2026, month: 9 });
	});
	it.each([
		null,
		undefined,
		'',
		'2026-13',
		'2026-00',
		'2026-9',
		'26-09',
		'abc',
		'2026-09-01',
		'0000-01'
	])('rejects %s', (v) => {
		expect(parseMonthParam(v)).toBeNull();
	});
});

describe('month helpers', () => {
	it('formats param, label, month of day', () => {
		expect(formatMonthParam({ year: 2026, month: 3 })).toBe('2026-03');
		expect(monthLabel({ year: 2026, month: 2 })).toBe('février 2026');
		expect(monthOfDay('2026-09-28')).toEqual({ year: 2026, month: 9 });
	});
	it('shifts across year boundaries', () => {
		expect(shiftMonth({ year: 2026, month: 1 }, -1)).toEqual({ year: 2025, month: 12 });
		expect(shiftMonth({ year: 2026, month: 12 }, 1)).toEqual({ year: 2027, month: 1 });
		expect(shiftMonth({ year: 2026, month: 5 }, 0)).toEqual({ year: 2026, month: 5 });
		expect(shiftMonth({ year: 2026, month: 5 }, -17)).toEqual({ year: 2024, month: 12 });
	});
	it('computes month range incl. leap February', () => {
		expect(monthRange({ year: 2024, month: 2 })).toEqual({ from: '2024-02-01', to: '2024-02-29' });
		expect(monthRange({ year: 2026, month: 2 }).to).toBe('2026-02-28');
	});
});

describe('buildMonthGrid', () => {
	it('starts weeks on Monday with null padding', () => {
		// 1 Sept 2026 is a Tuesday; 30 Sept is a Wednesday.
		const weeks = buildMonthGrid({ year: 2026, month: 9 });
		expect(weeks).toHaveLength(5);
		expect(weeks.every((w) => w.length === 7)).toBe(true);
		expect(weeks[0][0]).toBeNull();
		expect(weeks[0][1]).toBe('2026-09-01');
		expect(weeks[4][2]).toBe('2026-09-30');
		expect(weeks[4][3]).toBeNull();
	});
	it('has no leading padding when the month starts on Monday', () => {
		// 1 June 2026 is a Monday.
		expect(buildMonthGrid({ year: 2026, month: 6 })[0][0]).toBe('2026-06-01');
	});
	it('fits February 2027 (starts Monday, 28 days) into exactly 4 weeks', () => {
		const weeks = buildMonthGrid({ year: 2027, month: 2 });
		expect(weeks).toHaveLength(4);
		expect(weeks.flat().every((d) => d !== null)).toBe(true);
	});
	it('covers every day of the month once', () => {
		const days = buildMonthGrid({ year: 2024, month: 2 }).flat().filter(Boolean);
		expect(days).toHaveLength(29);
	});
});

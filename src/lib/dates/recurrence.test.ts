import { describe, expect, it } from 'vitest';
import { occurrenceOn, occurrences } from './recurrence';

describe('occurrences', () => {
	it('includes the origin date', () => {
		expect(occurrences('2024-01-31', 'monthly', null, '2024-01-31')).toEqual(['2024-01-31']);
	});

	it('returns an empty array when until is before origin', () => {
		expect(occurrences('2024-06-15', 'yearly', null, '2024-01-01')).toEqual([]);
	});

	it('clamps monthly occurrences from the origin day, not cumulatively (day 31)', () => {
		const result = occurrences('2024-01-31', 'monthly', null, '2024-04-30');
		expect(result).toEqual(['2024-01-31', '2024-02-29', '2024-03-31', '2024-04-30']);
	});

	it('clamps monthly occurrences to the last day of short months (day 31, non-leap Feb)', () => {
		const result = occurrences('2025-01-31', 'monthly', null, '2025-03-31');
		expect(result).toEqual(['2025-01-31', '2025-02-28', '2025-03-31']);
	});

	it('produces 121 items for 10 years of monthly recurrence', () => {
		const result = occurrences('2024-01-31', 'monthly', null, '2034-01-31');
		expect(result).toHaveLength(121);
		expect(result[0]).toBe('2024-01-31');
		expect(result[result.length - 1]).toBe('2034-01-31');
	});

	it('clamps yearly 29/02 to 28/02 in non-leap years and back to 29/02 in leap years', () => {
		const result = occurrences('2020-02-29', 'yearly', null, '2024-02-29');
		expect(result).toContain('2021-02-28');
		expect(result).toContain('2024-02-29');
		expect(result).toEqual(['2020-02-29', '2021-02-28', '2022-02-28', '2023-02-28', '2024-02-29']);
	});

	it('respects an end date passed as until', () => {
		const fullRange = occurrences('2020-02-29', 'yearly', null, '2024-02-29');
		const limited = occurrences('2020-02-29', 'yearly', null, '2022-01-01');
		expect(limited).toEqual(['2020-02-29', '2021-02-28']);
		expect(limited.length).toBeLessThan(fullRange.length);
	});

	it('handles a yearly series on a regular day across years', () => {
		const result = occurrences('2018-06-12', 'yearly', null, '2021-06-12');
		expect(result).toEqual(['2018-06-12', '2019-06-12', '2020-06-12', '2021-06-12']);
	});

	it('stops at endIso when it is before untilIso', () => {
		const result = occurrences('2020-01-01', 'yearly', '2022-06-01', '2030-01-01');
		expect(result).toEqual(['2020-01-01', '2021-01-01', '2022-01-01']);
	});

	it('stops at untilIso when it is before endIso', () => {
		const result = occurrences('2020-01-01', 'yearly', '2030-01-01', '2022-06-01');
		expect(result).toEqual(['2020-01-01', '2021-01-01', '2022-01-01']);
	});

	it('returns an empty array when endIso is before origin', () => {
		expect(occurrences('2024-06-15', 'yearly', '2024-01-01', '2030-01-01')).toEqual([]);
	});
});

describe('occurrenceOn', () => {
	it('is true for the origin day itself', () => {
		expect(occurrenceOn('2018-06-12', 'yearly', '2018-06-12', null)).toBe(true);
	});

	it('is false before the origin', () => {
		expect(occurrenceOn('2018-06-12', 'yearly', '2017-06-12', null)).toBe(false);
	});

	it('respects yearly 29/02 -> 28/02 clamping in non-leap years', () => {
		expect(occurrenceOn('2020-02-29', 'yearly', '2021-02-28', null)).toBe(true);
		expect(occurrenceOn('2020-02-29', 'yearly', '2024-02-29', null)).toBe(true);
		expect(occurrenceOn('2020-02-29', 'yearly', '2021-03-01', null)).toBe(false);
	});

	it('respects monthly clamping to the last day of the month', () => {
		expect(occurrenceOn('2024-01-31', 'monthly', '2024-02-29', null)).toBe(true);
		expect(occurrenceOn('2025-01-31', 'monthly', '2025-02-28', null)).toBe(true);
		expect(occurrenceOn('2025-01-31', 'monthly', '2025-02-27', null)).toBe(false);
	});

	it('returns false for a day that does not match any occurrence', () => {
		expect(occurrenceOn('2018-06-12', 'yearly', '2019-07-12', null)).toBe(false);
	});

	it('respects an optional end date', () => {
		expect(occurrenceOn('2018-06-12', 'yearly', '2020-06-12', '2019-12-31')).toBe(false);
		expect(occurrenceOn('2018-06-12', 'yearly', '2019-06-12', '2019-12-31')).toBe(true);
	});
});

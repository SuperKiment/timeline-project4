import { describe, expect, it } from 'vitest';
import { formatDayFr, formatStamp, yearsAgoLabel } from './format';

describe('yearsAgoLabel', () => {
	it('uses the singular for one year', () => {
		expect(yearsAgoLabel(1)).toBe('Il y a 1 an');
	});
	it('uses the plural otherwise', () => {
		expect(yearsAgoLabel(2)).toBe('Il y a 2 ans');
		expect(yearsAgoLabel(10)).toBe('Il y a 10 ans');
	});
});

describe('formatStamp', () => {
	it('formats in French in the given timezone', () => {
		const ms = Date.UTC(2026, 4, 3, 12, 30);
		expect(formatStamp(ms, 'Europe/Paris')).toMatch(/^3 mai 2026 à 14:30$/);
	});
});

describe('formatDayFr', () => {
	it('defaults to the long style', () => {
		expect(formatDayFr('2026-05-03')).toBe('3 mai 2026');
	});
	it('supports the full style, with the weekday', () => {
		expect(formatDayFr('2026-05-03', 'full')).toBe('dimanche 3 mai 2026');
	});
	it('is timezone independent (UTC day)', () => {
		expect(formatDayFr('2026-01-01')).toBe('1 janvier 2026');
	});
});

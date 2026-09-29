import { describe, expect, it } from 'vitest';
import { HttpError } from './http-error';
import { assertValidDay, isFutureDay, monthDay, todayIn } from './time';

describe('todayIn', () => {
	it('resolves 2026-01-01T23:30:00Z to 2026-01-02 in Europe/Paris', () => {
		const now = new Date('2026-01-01T23:30:00Z');
		expect(todayIn('Europe/Paris', now)).toBe('2026-01-02');
	});

	it('resolves 2026-01-01T23:30:00Z to 2026-01-01 in UTC', () => {
		const now = new Date('2026-01-01T23:30:00Z');
		expect(todayIn('UTC', now)).toBe('2026-01-01');
	});
});

describe('isFutureDay', () => {
	it('returns true for a day after today', () => {
		const now = new Date('2026-01-01T12:00:00Z');
		expect(isFutureDay('2026-01-02', 'UTC', now)).toBe(true);
	});

	it('returns false for today and past days', () => {
		const now = new Date('2026-01-01T12:00:00Z');
		expect(isFutureDay('2026-01-01', 'UTC', now)).toBe(false);
		expect(isFutureDay('2025-12-31', 'UTC', now)).toBe(false);
	});
});

describe('monthDay', () => {
	it('extracts MM-DD from an ISO day', () => {
		expect(monthDay('2026-03-05')).toBe('03-05');
	});
});

describe('assertValidDay', () => {
	it('accepts a real calendar day', () => {
		expect(() => assertValidDay('2026-02-28')).not.toThrow();
	});

	it.each(['', '2026-13-45', '2026-02-30', '26-1-1'])('rejects %j with 400', (day) => {
		try {
			assertValidDay(day);
			expect.unreachable();
		} catch (err) {
			expect(err).toBeInstanceOf(HttpError);
			expect((err as HttpError).status).toBe(400);
		}
	});
});

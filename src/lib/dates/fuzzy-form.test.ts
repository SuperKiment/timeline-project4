import { describe, expect, it } from 'vitest';
import {
	fuzzyFormFieldsToValue,
	fuzzyToFormFields,
	parseFuzzyFormFields,
	resolveInitialFields,
	resolvePrecision
} from './fuzzy-form';

describe('parseFuzzyFormFields', () => {
	it('parses a day-precision date', () => {
		const result = parseFuzzyFormFields({ precision: 'day', year: '2018', month: '3', day: '12' });
		expect(result).toEqual({ year: 2018, month: 3, day: 12, precision: 'day' });
	});

	it('parses a month-precision date, ignoring an irrelevant day field', () => {
		const result = parseFuzzyFormFields({ precision: 'month', year: '2019', month: '6', day: '' });
		expect(result).toEqual({ year: 2019, month: 6, precision: 'month' });
	});

	it('parses a year-precision date, ignoring irrelevant month/day fields', () => {
		const result = parseFuzzyFormFields({ precision: 'year', year: '2018', month: '', day: '' });
		expect(result).toEqual({ year: 2018, precision: 'year' });
	});

	it('rejects an invalid precision', () => {
		const result = parseFuzzyFormFields({ precision: 'decade', year: '2018', month: '', day: '' });
		expect(result).toBe('Précision de date invalide.');
	});

	it('rejects a missing year', () => {
		const result = parseFuzzyFormFields({ precision: 'year', year: '', month: '', day: '' });
		expect(result).toBe("L'année est requise.");
	});

	it('rejects a missing month for month precision', () => {
		const result = parseFuzzyFormFields({ precision: 'month', year: '2019', month: '', day: '' });
		expect(result).toBe('Le mois est requis.');
	});

	it('rejects a missing day for day precision', () => {
		const result = parseFuzzyFormFields({ precision: 'day', year: '2019', month: '3', day: '' });
		expect(result).toBe('Le jour est requis.');
	});

	it('rejects a non-numeric field', () => {
		const result = parseFuzzyFormFields({ precision: 'year', year: 'abc', month: '', day: '' });
		expect(result).toBe("L'année est requise.");
	});

	it('rejects a calendar-invalid date (31 février)', () => {
		const result = parseFuzzyFormFields({ precision: 'day', year: '2019', month: '2', day: '31' });
		expect(result).toBe("Cette date n'existe pas.");
	});

	it('rejects an invalid leap day', () => {
		const result = parseFuzzyFormFields({ precision: 'day', year: '2019', month: '2', day: '29' });
		expect(result).toBe("Cette date n'existe pas.");
	});

	it('accepts a valid leap day', () => {
		const result = parseFuzzyFormFields({ precision: 'day', year: '2024', month: '2', day: '29' });
		expect(result).toEqual({ year: 2024, month: 2, day: 29, precision: 'day' });
	});
});

describe('fuzzyToFormFields', () => {
	it('round-trips a day-precision date', () => {
		const fd = { year: 2018, month: 3, day: 12, precision: 'day' as const };
		expect(fuzzyToFormFields(fd)).toEqual({
			precision: 'day',
			year: '2018',
			month: '3',
			day: '12'
		});
		expect(parseFuzzyFormFields(fuzzyToFormFields(fd))).toEqual(fd);
	});

	it('round-trips a year-precision date', () => {
		const fd = { year: 2018, precision: 'year' as const };
		expect(fuzzyToFormFields(fd)).toEqual({ precision: 'year', year: '2018', month: '', day: '' });
	});

	it('defaults to day precision with blank fields for null', () => {
		expect(fuzzyToFormFields(null)).toEqual({ precision: 'day', year: '', month: '', day: '' });
	});
});

describe('resolveInitialFields', () => {
	it('prefers explicit fields over value (e.g. after a fail(400) re-render)', () => {
		const fields = { precision: 'day', year: '2019', month: '2', day: '31' };
		const value = { year: 2018, precision: 'year' as const };
		expect(resolveInitialFields(fields, value)).toEqual(fields);
	});

	it('falls back to the structured value when no fields are given', () => {
		const value = { year: 2018, month: 3, day: 12, precision: 'day' as const };
		expect(resolveInitialFields(undefined, value)).toEqual(fuzzyToFormFields(value));
	});

	it('falls back to blank fields when neither is given', () => {
		expect(resolveInitialFields(undefined, undefined)).toEqual(fuzzyToFormFields(null));
	});
});

describe('resolvePrecision', () => {
	it('keeps the current precision when allowed', () => {
		expect(resolvePrecision('month', ['day', 'month', 'year'])).toBe('month');
	});

	it('falls back to the first allowed precision when not allowed', () => {
		expect(resolvePrecision('month', ['day', 'year'])).toBe('day');
	});

	it('falls back for a garbage precision string', () => {
		expect(resolvePrecision('decade', ['year'])).toBe('year');
	});
});

describe('fuzzyFormFieldsToValue', () => {
	it('returns the parsed FuzzyDate for valid fields', () => {
		const fields = { precision: 'day', year: '2018', month: '3', day: '12' };
		expect(fuzzyFormFieldsToValue(fields)).toEqual({
			year: 2018,
			month: 3,
			day: 12,
			precision: 'day'
		});
	});

	it('returns null for an incomplete year', () => {
		expect(fuzzyFormFieldsToValue({ precision: 'year', year: '', month: '', day: '' })).toBeNull();
	});

	it('returns null for a calendar-invalid date (31 février)', () => {
		expect(
			fuzzyFormFieldsToValue({ precision: 'day', year: '2019', month: '2', day: '31' })
		).toBeNull();
	});
});

/**
 * Form-side helpers for fuzzy dates: converting between the raw string fields
 * of an HTML form (`<name>_precision/_year/_month/_day`) and a `FuzzyDate`.
 * Pure functions, no Node APIs — usable from both the `FuzzyDateInput`
 * component and server-side form actions parsing `FormData`.
 */

import { isValidFuzzy, PRECISIONS, type FuzzyDate, type Precision } from './fuzzy';

/** Raw string values as read from `FormData`/form fields, before parsing. */
export interface FuzzyFormFields {
	precision: string;
	year: string;
	month: string;
	day: string;
}

function isPrecision(value: string): value is Precision {
	return (PRECISIONS as readonly string[]).includes(value);
}

/** Parses a required integer field; returns `null` when blank or not an integer. */
function parseIntField(raw: string): number | null {
	const trimmed = raw.trim();
	if (trimmed === '') return null;
	if (!/^-?\d+$/.test(trimmed)) return null;
	return Number(trimmed);
}

/**
 * Parses the raw string fields of a fuzzy date form group into a `FuzzyDate`,
 * or a French error message when the fields are missing/invalid for the
 * declared precision, or denote a date that does not exist (e.g. 31 février).
 */
export function parseFuzzyFormFields(fields: FuzzyFormFields): FuzzyDate | string {
	if (!isPrecision(fields.precision)) {
		return 'Précision de date invalide.';
	}
	const precision = fields.precision;

	const year = parseIntField(fields.year);
	if (year === null) {
		return "L'année est requise.";
	}

	const fd: FuzzyDate = { year, precision };

	if (precision === 'month' || precision === 'day') {
		const month = parseIntField(fields.month);
		if (month === null) {
			return 'Le mois est requis.';
		}
		fd.month = month;
	}

	if (precision === 'day') {
		const day = parseIntField(fields.day);
		if (day === null) {
			return 'Le jour est requis.';
		}
		fd.day = day;
	}

	if (!isValidFuzzy(fd)) {
		return "Cette date n'existe pas.";
	}

	return fd;
}

/** Inverse of `parseFuzzyFormFields`: a `FuzzyDate` (or `null`) to raw string fields. */
export function fuzzyToFormFields(fd: FuzzyDate | null): FuzzyFormFields {
	if (!fd) {
		return { precision: 'day', year: '', month: '', day: '' };
	}
	return {
		precision: fd.precision,
		year: String(fd.year),
		month: fd.month !== undefined ? String(fd.month) : '',
		day: fd.day !== undefined ? String(fd.day) : ''
	};
}

/**
 * `FuzzyDateInput`'s initial raw fields: server-provided `fields` (e.g. after
 * a `fail(400)` re-render, to keep the user's exact invalid input) take
 * precedence over a structured `value`.
 */
export function resolveInitialFields(
	fields: FuzzyFormFields | null | undefined,
	value: FuzzyDate | null | undefined
): FuzzyFormFields {
	return fields ?? fuzzyToFormFields(value ?? null);
}

/** Falls back to the first allowed precision when `precision` isn't one of `allowedPrecisions`. */
export function resolvePrecision(
	precision: string,
	allowedPrecisions: readonly Precision[]
): Precision {
	return (allowedPrecisions as readonly string[]).includes(precision)
		? (precision as Precision)
		: allowedPrecisions[0];
}

/**
 * `FuzzyDateInput`'s bindable `value`: the parsed `FuzzyDate`, or `null` when
 * the raw fields are incomplete/invalid (the hidden inputs remain the source
 * of truth for submission; server-side `parseFuzzyFormFields` reports the
 * actual French error).
 */
export function fuzzyFormFieldsToValue(fields: FuzzyFormFields): FuzzyDate | null {
	const result = parseFuzzyFormFields(fields);
	return typeof result === 'string' ? null : result;
}

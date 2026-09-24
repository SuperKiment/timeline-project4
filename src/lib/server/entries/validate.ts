import { isPeriodValid, type FuzzyDate } from '../../dates/fuzzy';
import { parseFuzzyFormFields, type FuzzyFormFields } from '../../dates/fuzzy-form';
import { ENTRY_TYPES, type EntryType } from '../../timeline/types';
import { RECURRENCE_FREQS, type RecurrenceFreq } from '../db/schema';

/** Typed, validated entry input ready to be persisted by the entries service. */
export interface EntryInput {
	type: EntryType;
	title: string;
	description: string | null;
	location: string | null;
	tags: string[];
	start: FuzzyDate;
	end: FuzzyDate | null;
	recurrenceFreq: RecurrenceFreq | null;
}

export type EntryInputField = 'type' | 'title' | 'start' | 'end' | 'recurrenceFreq';

export type EntryValidationResult =
	{ ok: true; value: EntryInput } | { ok: false; errors: Partial<Record<EntryInputField, string>> };

/**
 * Loosely-typed input as received from a form/JSON body, before validation.
 * `start`/`end` are the raw string fields of a `FuzzyDateInput` form group
 * (see `src/lib/dates/fuzzy-form.ts`), parsed here via `parseFuzzyFormFields`.
 */
export interface RawEntryInput {
	type?: unknown;
	title?: unknown;
	description?: unknown;
	location?: unknown;
	tags?: unknown;
	start?: FuzzyFormFields;
	end?: FuzzyFormFields;
	recurrenceFreq?: unknown;
}

/** Empty fuzzy form fields, used when `start`/`end` is missing altogether. */
const BLANK_FUZZY_FIELDS: FuzzyFormFields = { precision: 'day', year: '', month: '', day: '' };

/** Whether an end date's fields are all blank, i.e. "no end given". */
function isBlankFuzzyFields(fields: FuzzyFormFields | undefined): boolean {
	if (!fields) return true;
	return fields.year.trim() === '' && fields.month.trim() === '' && fields.day.trim() === '';
}

/** Trims a string field to `null` when missing, non-string or empty. */
function trimToNull(v: unknown): string | null {
	if (typeof v !== 'string') return null;
	const trimmed = v.trim();
	return trimmed === '' ? null : trimmed;
}

/** Trims and deduplicates a list of tags, dropping empty/non-string entries. */
function normalizeTags(v: unknown): string[] {
	if (!Array.isArray(v)) return [];
	const seen = new Set<string>();
	const tags: string[] = [];
	for (const item of v) {
		if (typeof item !== 'string') continue;
		const trimmed = item.trim();
		if (trimmed === '' || seen.has(trimmed)) continue;
		seen.add(trimmed);
		tags.push(trimmed);
	}
	return tags;
}

/**
 * Validates raw entry input into a typed {@link EntryInput}, or a bag of
 * French per-field error messages: title and start are always required
 * (start/end parsing and messages are delegated to `parseFuzzyFormFields`);
 * `phase`/`histoire` may have an end, `souvenir`/`important` may not,
 * `recurrent` requires a day-precision start and a frequency plus an
 * optional day-precision end; a period whose end finishes before its start
 * is refused (EC-2); tags are trimmed and deduplicated (FR-4, FR-5, FR-6).
 */
export function validateEntryInput(raw: RawEntryInput): EntryValidationResult {
	const errors: Partial<Record<EntryInputField, string>> = {};

	const type = raw.type as EntryType;
	if (!ENTRY_TYPES.includes(type)) {
		errors.type = "Type d'entrée invalide.";
	}

	const title = trimToNull(raw.title);
	if (!title) {
		errors.title = 'Le titre est requis.';
	}

	const startResult = parseFuzzyFormFields(raw.start ?? BLANK_FUZZY_FIELDS);
	let validStart: FuzzyDate | null = null;
	if (typeof startResult === 'string') {
		errors.start = startResult;
	} else {
		validStart = startResult;
	}

	const endBlank = isBlankFuzzyFields(raw.end);
	let validEnd: FuzzyDate | null = null;
	if (!endBlank) {
		const endResult = parseFuzzyFormFields(raw.end as FuzzyFormFields);
		if (typeof endResult === 'string') {
			errors.end = endResult;
		} else {
			validEnd = endResult;
		}
	}

	if (type === 'souvenir' || type === 'important') {
		if (!endBlank) {
			errors.end =
				'Les souvenirs et les événements importants ne peuvent pas avoir de date de fin.';
		}
	}

	let recurrenceFreq: RecurrenceFreq | null = null;
	if (type === 'recurrent') {
		if (validStart && validStart.precision !== 'day') {
			errors.start = 'Une entrée récurrente nécessite une date de début précise (jour).';
		}

		const freq = raw.recurrenceFreq as RecurrenceFreq;
		if (!RECURRENCE_FREQS.includes(freq)) {
			errors.recurrenceFreq = 'Une fréquence de récurrence est requise.';
		} else {
			recurrenceFreq = freq;
		}

		if (validEnd && validEnd.precision !== 'day' && !errors.end) {
			errors.end = "La date de fin d'une récurrence doit être précise (jour).";
		}
	}

	if (validStart && validEnd && !errors.end && !isPeriodValid(validStart, validEnd)) {
		errors.end = 'La date de fin ne peut pas être antérieure à la date de début.';
	}

	if (Object.keys(errors).length > 0) {
		return { ok: false, errors };
	}

	return {
		ok: true,
		value: {
			type,
			title: title as string,
			description: trimToNull(raw.description),
			location: trimToNull(raw.location),
			tags: normalizeTags(raw.tags),
			start: validStart as FuzzyDate,
			end: type === 'souvenir' || type === 'important' ? null : validEnd,
			recurrenceFreq
		}
	};
}

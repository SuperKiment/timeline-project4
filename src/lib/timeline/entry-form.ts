/**
 * Pure helpers for the entry create/edit form: tags parsing, `FormData` →
 * form values mapping, prefill from query string, entry → form values.
 * No Node/Svelte imports — usable from components and server actions.
 */

import { fromSortKey, isValidFuzzy, parseIsoDay } from '../dates/fuzzy';
import { fuzzyToFormFields, type FuzzyFormFields } from '../dates/fuzzy-form';
import { ENTRY_TYPES, type EntryType } from './types';

/** Raw (string-typed) form state, as kept and re-rendered after a failed submit. */
export interface EntryFormValues {
	type: string;
	title: string;
	description: string;
	location: string;
	tags: string[];
	recurrenceFreq: string;
	start: FuzzyFormFields;
	end: FuzzyFormFields;
}

/** Minimal shape of a stored entry needed to fill the form. */
export interface EntryLike {
	type: string;
	title: string;
	description: string | null;
	location: string | null;
	tags: string;
	startSort: string;
	endSort: string | null;
	recurrenceFreq: string | null;
}

/** Minimal `FormData`/`URLSearchParams`-like reader. */
interface FieldReader {
	get(name: string): unknown;
}

export const DEFAULT_ENTRY_TYPE: EntryType = 'souvenir';

export function isEntryType(value: unknown): value is EntryType {
	return typeof value === 'string' && (ENTRY_TYPES as readonly string[]).includes(value);
}

/** Splits free text on commas into trimmed, non-empty tags. */
export function splitTags(raw: string): string[] {
	return raw
		.split(',')
		.map((t) => t.trim())
		.filter((t) => t !== '');
}

/** Maximum number of tags kept per entry. */
export const MAX_TAGS = 30;
/** Maximum length of a single tag (longer ones are truncated). */
export const MAX_TAG_LENGTH = 50;

/**
 * Trims and truncates each tag to `MAX_TAG_LENGTH`, drops empty ones and
 * duplicates, then keeps at most `MAX_TAGS` (extras are dropped).
 */
function normalizeTags(tags: readonly string[]): string[] {
	const cleaned = tags.map((t) => t.trim().slice(0, MAX_TAG_LENGTH).trim()).filter((t) => t !== '');
	return [...new Set(cleaned)].slice(0, MAX_TAGS);
}

/**
 * Appends the tags found in `draft` to `tags`, dropping duplicates (order kept)
 * and enforcing the tag caps.
 */
export function mergeTags(tags: readonly string[], draft: string): string[] {
	return normalizeTags([...tags, ...splitTags(draft)]);
}

/**
 * Parses a JSON array of strings; anything else (or invalid JSON) yields `[]`.
 * Non-string entries are ignored and the tag caps are enforced.
 */
export function parseTagsJson(raw: unknown): string[] {
	if (typeof raw !== 'string' || raw === '') return [];
	try {
		const parsed: unknown = JSON.parse(raw);
		if (!Array.isArray(parsed)) return [];
		return normalizeTags(parsed.filter((t): t is string => typeof t === 'string'));
	} catch {
		return [];
	}
}

function text(data: FieldReader, name: string): string {
	const v = data.get(name);
	return typeof v === 'string' ? v : '';
}

/** Reads the `<name>_precision/_year/_month/_day` fields of a `FuzzyDateInput`. */
export function readFuzzyFields(data: FieldReader, name: string): FuzzyFormFields {
	return {
		precision: text(data, `${name}_precision`) || 'day',
		year: text(data, `${name}_year`),
		month: text(data, `${name}_month`),
		day: text(data, `${name}_day`)
	};
}

/** Maps submitted entry form data to raw form values (no validation). */
export function entryFormValuesFromFormData(data: FieldReader): EntryFormValues {
	return {
		type: text(data, 'type'),
		title: text(data, 'title'),
		description: text(data, 'description'),
		location: text(data, 'location'),
		tags: parseTagsJson(text(data, 'tags')),
		recurrenceFreq: text(data, 'recurrenceFreq'),
		start: readFuzzyFields(data, 'start'),
		end: readFuzzyFields(data, 'end')
	};
}

export function emptyEntryFormValues(type: EntryType = DEFAULT_ENTRY_TYPE): EntryFormValues {
	return {
		type,
		title: '',
		description: '',
		location: '',
		tags: [],
		recurrenceFreq: 'yearly',
		start: fuzzyToFormFields(null),
		end: fuzzyToFormFields(null)
	};
}

/**
 * Initial values for `/entries/new?type=&date=YYYY-MM-DD` (FR-18 promote):
 * an unknown type falls back to souvenir, a missing/invalid date to `today`.
 */
export function prefillEntryFormValues(params: FieldReader, today: string): EntryFormValues {
	const rawType = params.get('type');
	const values = emptyEntryFormValues(isEntryType(rawType) ? rawType : DEFAULT_ENTRY_TYPE);

	const rawDate = params.get('date');
	const candidate =
		typeof rawDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : null;
	const isoDay =
		candidate && isValidFuzzy({ precision: 'day', ...parseIsoDay(candidate) }) ? candidate : today;
	values.start = fuzzyToFormFields(fromSortKey(isoDay));
	return values;
}

/** Form values for editing a stored entry. */
export function entryToFormValues(entry: EntryLike): EntryFormValues {
	return {
		type: entry.type,
		title: entry.title,
		description: entry.description ?? '',
		location: entry.location ?? '',
		tags: parseTagsJson(entry.tags),
		recurrenceFreq: entry.recurrenceFreq ?? 'yearly',
		start: fuzzyToFormFields(fromSortKey(entry.startSort)),
		end: fuzzyToFormFields(entry.endSort ? fromSortKey(entry.endSort) : null)
	};
}

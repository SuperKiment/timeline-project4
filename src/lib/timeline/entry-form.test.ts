import { describe, expect, it } from 'vitest';
import {
	entryFormValuesFromFormData,
	entryToFormValues,
	mergeTags,
	parseTagsJson,
	prefillEntryFormValues,
	splitTags
} from './entry-form';

describe('tags helpers', () => {
	it('splits on commas, trims and drops empties', () => {
		expect(splitTags(' a, b ,,c ')).toEqual(['a', 'b', 'c']);
		expect(splitTags('')).toEqual([]);
	});

	it('merges a draft into tags without duplicates', () => {
		expect(mergeTags(['a', 'b'], 'b, c')).toEqual(['a', 'b', 'c']);
	});

	it('parses tags JSON defensively', () => {
		expect(parseTagsJson('["x","y","x",3]')).toEqual(['x', 'y']);
		expect(parseTagsJson('not json')).toEqual([]);
		expect(parseTagsJson('{"a":1}')).toEqual([]);
		expect(parseTagsJson('')).toEqual([]);
	});
});

describe('entryFormValuesFromFormData', () => {
	it('maps form fields to raw values', () => {
		const fd = new FormData();
		fd.set('type', 'phase');
		fd.set('title', 'Vacances');
		fd.set('tags', '["été"]');
		fd.set('start_precision', 'month');
		fd.set('start_year', '2024');
		fd.set('start_month', '7');
		fd.set('end_year', '2023');
		const v = entryFormValuesFromFormData(fd);
		expect(v.type).toBe('phase');
		expect(v.tags).toEqual(['été']);
		expect(v.start).toEqual({ precision: 'month', year: '2024', month: '7', day: '' });
		expect(v.end).toEqual({ precision: 'day', year: '2023', month: '', day: '' });
		expect(v.description).toBe('');
	});
});

describe('prefillEntryFormValues', () => {
	it('prefills type and date from the query', () => {
		const v = prefillEntryFormValues(
			new URLSearchParams('type=souvenir&date=2024-05-01'),
			'2026-01-01'
		);
		expect(v.type).toBe('souvenir');
		expect(v.start).toEqual({ precision: 'day', year: '2024', month: '5', day: '1' });
	});

	it('falls back to souvenir and today on invalid params', () => {
		const v = prefillEntryFormValues(
			new URLSearchParams('type=bogus&date=2024-02-31'),
			'2026-03-04'
		);
		expect(v.type).toBe('souvenir');
		expect(v.start).toEqual({ precision: 'day', year: '2026', month: '3', day: '4' });
	});
});

describe('entryToFormValues', () => {
	it('converts a stored entry', () => {
		const v = entryToFormValues({
			type: 'phase',
			title: 'T',
			description: null,
			location: 'Lyon',
			tags: '["a"]',
			startSort: '2020-03-00',
			endSort: '2021-00-00',
			recurrenceFreq: null
		});
		expect(v.start).toEqual({ precision: 'month', year: '2020', month: '3', day: '' });
		expect(v.end).toEqual({ precision: 'year', year: '2021', month: '', day: '' });
		expect(v.description).toBe('');
		expect(v.tags).toEqual(['a']);
	});
});

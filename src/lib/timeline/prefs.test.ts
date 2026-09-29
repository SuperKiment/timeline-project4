import { describe, expect, it } from 'vitest';
import {
	defaultView,
	loadView,
	parseTypesParam,
	saveView,
	typesToParam,
	VIEW_STORAGE_KEY,
	type ViewStorage
} from './prefs';
import { ENTRY_TYPES } from './types';

function fakeStorage(initial: Record<string, string> = {}): ViewStorage & {
	data: Record<string, string>;
} {
	const data = { ...initial };
	return {
		data,
		getItem: (key) => data[key] ?? null,
		setItem: (key, value) => {
			data[key] = value;
		}
	};
}

const wide = () => ({ matches: true });
const narrow = () => ({ matches: false });

describe('defaultView', () => {
	it('is horizontal on wide screens, vertical otherwise or without matchMedia', () => {
		expect(defaultView(wide)).toBe('horizontal');
		expect(defaultView(narrow)).toBe('vertical');
		expect(defaultView()).toBe('vertical');
	});
});

describe('loadView / saveView', () => {
	it('falls back to the default when nothing is stored', () => {
		expect(loadView(() => fakeStorage(), wide)).toBe('horizontal');
		expect(loadView(() => fakeStorage(), narrow)).toBe('vertical');
	});

	it('stored choice wins over the default', () => {
		expect(loadView(() => fakeStorage({ [VIEW_STORAGE_KEY]: 'vertical' }), wide)).toBe('vertical');
		expect(loadView(() => fakeStorage({ [VIEW_STORAGE_KEY]: 'horizontal' }), narrow)).toBe(
			'horizontal'
		);
	});

	it('ignores unknown stored values', () => {
		expect(loadView(() => fakeStorage({ [VIEW_STORAGE_KEY]: 'grid' }), narrow)).toBe('vertical');
	});

	it('survives a throwing storage', () => {
		const broken: ViewStorage = {
			getItem: () => {
				throw new Error('denied');
			},
			setItem: () => {
				throw new Error('denied');
			}
		};
		expect(loadView(() => broken, wide)).toBe('horizontal');
		expect(() => saveView('vertical', () => broken)).not.toThrow();
	});

	it('survives a storage accessor that throws (blocked storage)', () => {
		const blocked = () => {
			throw new DOMException('denied', 'SecurityError');
		};
		expect(loadView(blocked, wide)).toBe('horizontal');
		expect(loadView(blocked, narrow)).toBe('vertical');
		expect(() => saveView('vertical', blocked)).not.toThrow();
	});

	it('round-trips through storage', () => {
		const storage = fakeStorage();
		saveView('horizontal', () => storage);
		expect(storage.data[VIEW_STORAGE_KEY]).toBe('horizontal');
		expect(loadView(() => storage, narrow)).toBe('horizontal');
	});
});

describe('parseTypesParam', () => {
	it('returns all types when absent or empty', () => {
		expect(parseTypesParam(null)).toEqual([...ENTRY_TYPES]);
		expect(parseTypesParam(undefined)).toEqual([...ENTRY_TYPES]);
		expect(parseTypesParam('')).toEqual([...ENTRY_TYPES]);
	});

	it('ignores invalid values, and all types when none is valid', () => {
		expect(parseTypesParam('phase,bogus')).toEqual(['phase']);
		expect(parseTypesParam('bogus,,x')).toEqual([...ENTRY_TYPES]);
	});

	it('dedupes, trims and uses canonical order', () => {
		expect(parseTypesParam('histoire, souvenir,histoire')).toEqual(['souvenir', 'histoire']);
	});
});

describe('typesToParam', () => {
	it('omits the param when all (or none) are selected', () => {
		expect(typesToParam([...ENTRY_TYPES])).toBeNull();
		expect(typesToParam([])).toBeNull();
	});

	it('joins a subset in canonical order', () => {
		expect(typesToParam(['histoire', 'souvenir'])).toBe('souvenir,histoire');
	});
});

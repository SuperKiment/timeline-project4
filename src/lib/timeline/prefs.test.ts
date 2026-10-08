import { describe, expect, it } from 'vitest';
import {
	defaultView,
	initialView,
	parseTypesParam,
	parseView,
	typesToParam,
	viewCookie,
	VIEW_STORAGE_KEY,
	type ViewStorage
} from './prefs';
import { ENTRY_TYPES } from './types';

function fakeStorage(data: Record<string, string> = {}): ViewStorage {
	return { getItem: (key) => data[key] ?? null };
}

const wide = () => ({ matches: true });
const narrow = () => ({ matches: false });

describe('parseView', () => {
	it('accepts known views only', () => {
		expect(parseView('vertical')).toBe('vertical');
		expect(parseView('horizontal')).toBe('horizontal');
		expect(parseView('grid')).toBeNull();
		expect(parseView('')).toBeNull();
		expect(parseView(null)).toBeNull();
		expect(parseView(undefined)).toBeNull();
	});
});

describe('defaultView', () => {
	it('is horizontal on wide screens, vertical otherwise or without matchMedia', () => {
		expect(defaultView(wide)).toBe('horizontal');
		expect(defaultView(narrow)).toBe('vertical');
		expect(defaultView()).toBe('vertical');
	});
});

describe('initialView', () => {
	it('falls back to the default when nothing is stored', () => {
		expect(initialView(() => fakeStorage(), wide)).toBe('horizontal');
		expect(initialView(() => fakeStorage(), narrow)).toBe('vertical');
	});

	it('migrates a stored choice, which wins over the default', () => {
		expect(initialView(() => fakeStorage({ [VIEW_STORAGE_KEY]: 'vertical' }), wide)).toBe(
			'vertical'
		);
		expect(initialView(() => fakeStorage({ [VIEW_STORAGE_KEY]: 'horizontal' }), narrow)).toBe(
			'horizontal'
		);
	});

	it('ignores unknown stored values', () => {
		expect(initialView(() => fakeStorage({ [VIEW_STORAGE_KEY]: 'grid' }), narrow)).toBe('vertical');
	});

	it('survives a throwing storage', () => {
		const broken: ViewStorage = {
			getItem: () => {
				throw new Error('denied');
			}
		};
		expect(initialView(() => broken, wide)).toBe('horizontal');
	});

	it('survives a storage accessor that throws (blocked storage)', () => {
		const blocked = () => {
			throw new DOMException('denied', 'SecurityError');
		};
		expect(initialView(blocked, wide)).toBe('horizontal');
		expect(initialView(blocked, narrow)).toBe('vertical');
	});
});

describe('viewCookie', () => {
	it('persists the view site-wide for a year', () => {
		expect(viewCookie('horizontal')).toBe(
			'timeline_view=horizontal; Path=/; Max-Age=31536000; SameSite=Lax'
		);
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

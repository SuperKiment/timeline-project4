import { ENTRY_TYPES, type EntryType } from './types';

export type TimelineView = 'vertical' | 'horizontal';

export const VIEW_STORAGE_KEY = 'timeline.view';
export const DESKTOP_MEDIA_QUERY = '(min-width: 1024px)';

/** Minimal `Storage` surface used here, so tests can inject a fake. */
export interface ViewStorage {
	getItem(key: string): string | null;
	setItem(key: string, value: string): void;
}

/**
 * Lazy storage accessor. Reading `window.localStorage` itself can throw
 * (SecurityError when storage is blocked), so it must be resolved inside
 * the try/catch of the callers below.
 */
export type ViewStorageAccessor = () => ViewStorage;

/** Minimal `window.matchMedia` surface used here, so tests can inject a fake. */
export type MatchMediaFn = (query: string) => { matches: boolean };

function isView(value: unknown): value is TimelineView {
	return value === 'vertical' || value === 'horizontal';
}

/** Horizontal on wide screens (>= 1024px), vertical otherwise or when unknown (SSR). */
export function defaultView(matchMedia?: MatchMediaFn): TimelineView {
	return matchMedia?.(DESKTOP_MEDIA_QUERY).matches ? 'horizontal' : 'vertical';
}

/**
 * Saved choice from storage, else the screen-size default. Storage errors
 * (private mode, disabled storage) and unknown stored values are ignored.
 */
export function loadView(getStorage: ViewStorageAccessor, matchMedia: MatchMediaFn): TimelineView {
	try {
		const stored = getStorage().getItem(VIEW_STORAGE_KEY);
		if (isView(stored)) return stored;
	} catch {
		// fall through to the default
	}
	return defaultView(matchMedia);
}

/** Persists the choice; silently does nothing when storage is unavailable. */
export function saveView(view: TimelineView, getStorage: ViewStorageAccessor): void {
	try {
		getStorage().setItem(VIEW_STORAGE_KEY, view);
	} catch {
		// non-fatal: the choice just won't persist
	}
}

/**
 * Parses the `?types=a,b` query value. Unknown values are ignored, duplicates
 * collapse, the result follows the canonical `ENTRY_TYPES` order, and an
 * absent/empty/all-invalid value means "all types".
 */
export function parseTypesParam(value: string | null | undefined): EntryType[] {
	const requested = new Set((value ?? '').split(',').map((part) => part.trim()));
	const selected = ENTRY_TYPES.filter((type) => requested.has(type));
	return selected.length > 0 ? selected : [...ENTRY_TYPES];
}

/** Query value for `types`, or `null` when all types are selected (param omitted). */
export function typesToParam(types: readonly EntryType[]): string | null {
	const normalized = ENTRY_TYPES.filter((type) => types.includes(type));
	return normalized.length === 0 || normalized.length === ENTRY_TYPES.length
		? null
		: normalized.join(',');
}

import { ENTRY_TYPES, type EntryType } from './types';

export type TimelineView = 'vertical' | 'horizontal';

/** Cookie holding the chosen view, so the home page is rendered with it on the server. */
export const VIEW_COOKIE = 'timeline_view';
const VIEW_COOKIE_MAX_AGE = 365 * 24 * 60 * 60;

/** Where the choice was stored before the cookie; only read to migrate it. */
export const VIEW_STORAGE_KEY = 'timeline.view';
export const DESKTOP_MEDIA_QUERY = '(min-width: 1024px)';

/** Minimal read-only `Storage` surface used here, so tests can inject a fake. */
export interface ViewStorage {
	getItem(key: string): string | null;
}

/**
 * Lazy storage accessor. Reading `window.localStorage` itself can throw
 * (SecurityError when storage is blocked), so it must be resolved inside
 * the try/catch of `initialView`.
 */
export type ViewStorageAccessor = () => ViewStorage;

/** Minimal `window.matchMedia` surface used here, so tests can inject a fake. */
export type MatchMediaFn = (query: string) => { matches: boolean };

/** A stored view value, or `null` when absent or unknown. */
export function parseView(value: string | null | undefined): TimelineView | null {
	return value === 'vertical' || value === 'horizontal' ? value : null;
}

/** Horizontal on wide screens (>= 1024px), vertical otherwise or when unknown (SSR). */
export function defaultView(matchMedia?: MatchMediaFn): TimelineView {
	return matchMedia?.(DESKTOP_MEDIA_QUERY).matches ? 'horizontal' : 'vertical';
}

/**
 * View for a browser without the cookie yet: the choice saved in storage by
 * earlier versions, else the screen-size default. Storage errors (private
 * mode, disabled storage) and unknown stored values are ignored.
 */
export function initialView(
	getStorage: ViewStorageAccessor,
	matchMedia: MatchMediaFn
): TimelineView {
	try {
		const stored = parseView(getStorage().getItem(VIEW_STORAGE_KEY));
		if (stored) return stored;
	} catch {
		// fall through to the default
	}
	return defaultView(matchMedia);
}

/** `document.cookie` assignment persisting the choice for a year. */
export function viewCookie(view: TimelineView): string {
	return `${VIEW_COOKIE}=${view}; Path=/; Max-Age=${VIEW_COOKIE_MAX_AGE}; SameSite=Lax`;
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

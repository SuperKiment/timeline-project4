/**
 * Client-safe shared timeline types (no server imports — usable from Svelte
 * components as well as server code). Extended by T13 with `TimelineItem`.
 */

export const ENTRY_TYPES = ['souvenir', 'important', 'phase', 'recurrent', 'histoire'] as const;
export type EntryType = (typeof ENTRY_TYPES)[number];

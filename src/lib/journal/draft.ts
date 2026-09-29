/**
 * Journal draft autosave (EC-13). Pure logic + an injectable storage so it
 * is testable in node; components pass `localStorage`.
 */

export interface DraftStorage {
	getItem(key: string): string | null;
	setItem(key: string, value: string): void;
	removeItem(key: string): void;
}

export interface Draft {
	text: string;
	mood: string | null;
	/** ms epoch of the last local edit. */
	savedAt: number;
}

/** localStorage key for a user's draft of a given day. */
export function draftKey(userId: number, day: string): string {
	return `journal-draft:${userId}:${day}`;
}

/** Whether `draft` is strictly newer than the server copy (`null` = no server entry). */
export function isDraftNewer(draft: Draft, serverUpdatedAt: number | null): boolean {
	return serverUpdatedAt === null || draft.savedAt > serverUpdatedAt;
}

function parseDraft(raw: string | null): Draft | null {
	if (raw === null) return null;
	try {
		const value: unknown = JSON.parse(raw);
		if (typeof value !== 'object' || value === null) return null;
		const { text, mood, savedAt } = value as Record<string, unknown>;
		if (typeof text !== 'string' || typeof savedAt !== 'number') return null;
		if (mood !== null && typeof mood !== 'string') return null;
		return { text, mood, savedAt };
	} catch {
		return null;
	}
}

/** Stores the draft; storage failures (quota, private mode) are swallowed. */
export function saveDraft(
	storage: DraftStorage,
	userId: number,
	day: string,
	text: string,
	mood: string | null,
	now: number = Date.now()
): void {
	try {
		const draft: Draft = { text, mood, savedAt: now };
		storage.setItem(draftKey(userId, day), JSON.stringify(draft));
	} catch {
		// Autosave is best-effort.
	}
}

/**
 * Returns the stored draft only if it is newer than the server copy and
 * differs from it; otherwise `null` (a stale draft is removed).
 */
export function loadDraft(
	storage: DraftStorage,
	userId: number,
	day: string,
	server: { text: string; mood: string | null; updatedAt: number } | null
): Draft | null {
	const key = draftKey(userId, day);
	try {
		const draft = parseDraft(storage.getItem(key));
		if (!draft) return null;
		if (
			!isDraftNewer(draft, server?.updatedAt ?? null) ||
			(server && draft.text === server.text && draft.mood === server.mood)
		) {
			storage.removeItem(key);
			return null;
		}
		return draft;
	} catch {
		return null;
	}
}

/** Removes the draft (after a successful save or delete). */
export function clearDraft(storage: DraftStorage, userId: number, day: string): void {
	try {
		storage.removeItem(draftKey(userId, day));
	} catch {
		// ignore
	}
}

const DRAFT_PREFIX = 'journal-draft:';

/** Storage that can enumerate its keys (`localStorage`). */
export type EnumerableDraftStorage = DraftStorage & {
	readonly length: number;
	key(index: number): string | null;
};

/** Removes every journal draft (e.g. after logout on a shared device); errors are swallowed. */
export function clearAllDrafts(storage: EnumerableDraftStorage): void {
	try {
		const keys: string[] = [];
		for (let i = 0; i < storage.length; i++) {
			const key = storage.key(i);
			if (key !== null && key.startsWith(DRAFT_PREFIX)) keys.push(key);
		}
		for (const key of keys) storage.removeItem(key);
	} catch {
		// ignore
	}
}

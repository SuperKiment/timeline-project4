import { describe, expect, it } from 'vitest';
import {
	clearDraft,
	draftKey,
	isDraftNewer,
	loadDraft,
	saveDraft,
	type DraftStorage
} from './draft';

function memoryStorage(): DraftStorage & { data: Map<string, string> } {
	const data = new Map<string, string>();
	return {
		data,
		getItem: (k) => data.get(k) ?? null,
		setItem: (k, v) => void data.set(k, v),
		removeItem: (k) => void data.delete(k)
	};
}

describe('draftKey', () => {
	it('builds journal-draft:<userId>:<day>', () => {
		expect(draftKey(3, '2026-05-01')).toBe('journal-draft:3:2026-05-01');
	});
});

describe('isDraftNewer', () => {
	const draft = { text: 'a', mood: null, savedAt: 100 };
	it('is newer without server entry', () => expect(isDraftNewer(draft, null)).toBe(true));
	it('is newer when savedAt > updatedAt', () => expect(isDraftNewer(draft, 99)).toBe(true));
	it('is not newer when equal or older', () => {
		expect(isDraftNewer(draft, 100)).toBe(false);
		expect(isDraftNewer(draft, 101)).toBe(false);
	});
});

describe('save/load/clear', () => {
	it('restores a newer draft', () => {
		const s = memoryStorage();
		saveDraft(s, 1, 'd', 'brouillon', '🙂', 200);
		expect(loadDraft(s, 1, 'd', { text: 'x', mood: null, updatedAt: 100 })).toEqual({
			text: 'brouillon',
			mood: '🙂',
			savedAt: 200
		});
	});

	it('drops an older draft', () => {
		const s = memoryStorage();
		saveDraft(s, 1, 'd', 'vieux', null, 50);
		expect(loadDraft(s, 1, 'd', { text: 'x', mood: null, updatedAt: 100 })).toBeNull();
		expect(s.data.size).toBe(0);
	});

	it('drops a draft identical to the server copy', () => {
		const s = memoryStorage();
		saveDraft(s, 1, 'd', 'x', null, 200);
		expect(loadDraft(s, 1, 'd', { text: 'x', mood: null, updatedAt: 100 })).toBeNull();
	});

	it('ignores corrupt data and clears', () => {
		const s = memoryStorage();
		s.setItem(draftKey(1, 'd'), '{nope');
		expect(loadDraft(s, 1, 'd', null)).toBeNull();
		saveDraft(s, 1, 'd', 'a', null, 1);
		clearDraft(s, 1, 'd');
		expect(s.data.size).toBe(0);
	});

	it('swallows storage errors', () => {
		const s: DraftStorage = {
			getItem: () => null,
			setItem: () => {
				throw new Error('quota');
			},
			removeItem: () => {}
		};
		expect(() => saveDraft(s, 1, 'd', 'a', null)).not.toThrow();
	});
});

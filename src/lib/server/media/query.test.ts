import { describe, expect, it } from 'vitest';
import type { Db } from '../db';
import { createTestDb } from '../db/test-db';
import { entries, journalEntries, media, users } from '../db/schema';
import { listMediaByOwner, toMediaItem } from './query';

const NOW = new Date('2026-06-15T12:00:00Z').getTime();

interface Owner {
	entryId?: number;
	journalEntryId?: number;
}

function setup(db: Db) {
	const userId = db
		.insert(users)
		.values({ username: 'alice', displayName: 'Alice', passwordHash: 'h', createdAt: NOW })
		.returning({ id: users.id })
		.get().id;
	const addEntry = () =>
		db
			.insert(entries)
			.values({
				type: 'souvenir',
				title: 't',
				startSort: '2026-01-01',
				startPrecision: 'day',
				createdAt: NOW,
				updatedAt: NOW
			})
			.returning({ id: entries.id })
			.get().id;
	const addJournal = (day: string) =>
		db
			.insert(journalEntries)
			.values({ userId, day, createdAt: NOW, updatedAt: NOW })
			.returning({ id: journalEntries.id })
			.get().id;
	return { addEntry, addJournal };
}

function addMedia(
	db: Db,
	opts: Owner & {
		createdAt?: number;
		deletedAt?: number | null;
		kind?: 'photo' | 'video';
		poster?: boolean;
	}
): number {
	const kind = opts.kind ?? 'photo';
	return db
		.insert(media)
		.values({
			entryId: opts.entryId ?? null,
			journalEntryId: opts.journalEntryId ?? null,
			kind,
			mime: kind === 'photo' ? 'image/webp' : 'video/mp4',
			storedName: 'x',
			thumbName: kind === 'photo' ? 't' : null,
			posterName: opts.poster ? 'p' : null,
			size: 1,
			width: kind === 'photo' ? 4032 : null,
			height: kind === 'photo' ? 3024 : null,
			originalName: 'o',
			createdAt: opts.createdAt ?? NOW,
			deletedAt: opts.deletedAt ?? null
		})
		.returning({ id: media.id })
		.get().id;
}

describe('listMediaByOwner', () => {
	it('groups media by owner and gives every requested id an entry', () => {
		const db = createTestDb();
		const { addEntry } = setup(db);
		const e1 = addEntry();
		const e2 = addEntry();
		const e3 = addEntry();
		const m1 = addMedia(db, { entryId: e1 });
		const m2 = addMedia(db, { entryId: e2 });
		const m3 = addMedia(db, { entryId: e1 });

		const result = listMediaByOwner(db, 'entry', [e1, e2, e3]);
		expect(result.get(e1)?.map((m) => m.id)).toEqual([m1, m3]);
		expect(result.get(e2)?.map((m) => m.id)).toEqual([m2]);
		expect(result.get(e3)).toEqual([]);
		expect(result.size).toBe(3);
	});

	it('excludes soft-deleted media', () => {
		const db = createTestDb();
		const { addEntry } = setup(db);
		const e = addEntry();
		const kept = addMedia(db, { entryId: e });
		addMedia(db, { entryId: e, deletedAt: NOW });

		expect(
			listMediaByOwner(db, 'entry', [e])
				.get(e)
				?.map((m) => m.id)
		).toEqual([kept]);
	});

	it('orders by created_at then id', () => {
		const db = createTestDb();
		const { addEntry } = setup(db);
		const e = addEntry();
		const late = addMedia(db, { entryId: e, createdAt: NOW + 10 });
		const earlyA = addMedia(db, { entryId: e, createdAt: NOW });
		const earlyB = addMedia(db, { entryId: e, createdAt: NOW });

		expect(
			listMediaByOwner(db, 'entry', [e])
				.get(e)
				?.map((m) => m.id)
		).toEqual([earlyA, earlyB, late]);
	});

	it('isolates owner kinds sharing the same numeric id', () => {
		const db = createTestDb();
		const { addEntry, addJournal } = setup(db);
		const e = addEntry();
		const j = addJournal('2026-06-01');
		expect(e).toBe(j);
		const entryMedia = addMedia(db, { entryId: e });
		const journalMedia = addMedia(db, { journalEntryId: j });

		expect(
			listMediaByOwner(db, 'entry', [e])
				.get(e)
				?.map((m) => m.id)
		).toEqual([entryMedia]);
		expect(
			listMediaByOwner(db, 'journal', [j])
				.get(j)
				?.map((m) => m.id)
		).toEqual([journalMedia]);
		expect(listMediaByOwner(db, 'occurrence', [e]).get(e)).toEqual([]);
	});

	it('returns an empty map for empty input', () => {
		const db = createTestDb();
		expect(listMediaByOwner(db, 'journal', []).size).toBe(0);
	});

	it('builds client-safe items (poster-less video has an empty thumbUrl)', () => {
		const db = createTestDb();
		const { addEntry } = setup(db);
		const e = addEntry();
		const photo = addMedia(db, { entryId: e });
		const withPoster = addMedia(db, { entryId: e, kind: 'video', poster: true });
		const bare = addMedia(db, { entryId: e, kind: 'video' });

		expect(listMediaByOwner(db, 'entry', [e]).get(e)).toEqual([
			{
				id: photo,
				kind: 'photo',
				thumbUrl: `/media/${photo}/thumb`,
				displayUrl: `/media/${photo}/display`,
				url: `/media/${photo}/original`,
				width: 4032,
				height: 3024
			},
			{
				id: withPoster,
				kind: 'video',
				thumbUrl: `/media/${withPoster}/poster`,
				displayUrl: `/media/${withPoster}/original`,
				url: `/media/${withPoster}/original`,
				width: null,
				height: null
			},
			{
				id: bare,
				kind: 'video',
				thumbUrl: '',
				displayUrl: `/media/${bare}/original`,
				url: `/media/${bare}/original`,
				width: null,
				height: null
			}
		]);
		expect(
			toMediaItem({
				id: 1,
				kind: 'photo',
				thumbName: 't',
				posterName: null,
				width: null,
				height: null
			}).thumbUrl
		).toBe('/media/1/thumb');
	});
});

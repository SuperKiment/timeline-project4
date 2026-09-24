import { describe, expect, it } from 'vitest';
import { createTestDb } from './db/test-db';
import { entries, journalEntries, media, occurrenceNotes, users } from './db/schema';
import { exportAll } from './export';

const now = Date.now();

describe('exportAll', () => {
	it('round-trips through JSON and never leaks password hashes or sessions', () => {
		const db = createTestDb();

		const user = db
			.insert(users)
			.values({
				username: 'alice',
				displayName: 'Alice',
				passwordHash: 'super-secret-argon2-hash',
				createdAt: now
			})
			.returning({ id: users.id })
			.get();

		const entry = db
			.insert(entries)
			.values({
				type: 'souvenir',
				title: 'Voyage a Kyoto',
				startSort: '2020-01-01',
				startPrecision: 'day',
				createdBy: user.id,
				createdAt: now,
				updatedAt: now
			})
			.returning({ id: entries.id })
			.get();

		const series = db
			.insert(entries)
			.values({
				type: 'recurrent',
				title: 'Anniversaire',
				startSort: '2019-05-01',
				startPrecision: 'day',
				recurrenceFreq: 'yearly',
				createdBy: user.id,
				createdAt: now,
				updatedAt: now
			})
			.returning({ id: entries.id })
			.get();

		const note = db
			.insert(occurrenceNotes)
			.values({
				seriesId: series.id,
				occurrenceDate: '2020-05-01',
				note: 'Restaurant',
				createdBy: user.id,
				createdAt: now,
				updatedAt: now
			})
			.returning({ id: occurrenceNotes.id })
			.get();

		const journal = db
			.insert(journalEntries)
			.values({
				userId: user.id,
				day: '2020-01-01',
				text: 'Belle journee',
				createdAt: now,
				updatedAt: now
			})
			.returning({ id: journalEntries.id })
			.get();

		db.insert(media)
			.values({
				entryId: entry.id,
				kind: 'photo',
				mime: 'image/jpeg',
				storedName: 'abc.jpg',
				size: 123,
				originalName: 'photo.jpg',
				createdBy: user.id,
				createdAt: now
			})
			.run();

		const data = exportAll(db);

		expect(data.version).toBe(1);
		expect(data.users).toEqual([{ id: user.id, username: 'alice', displayName: 'Alice' }]);
		expect(data.entries.map((e) => e.id)).toEqual([entry.id, series.id]);
		expect(data.occurrenceNotes.map((n) => n.id)).toEqual([note.id]);
		expect(data.journal.map((j) => j.id)).toEqual([journal.id]);
		expect(data.media).toHaveLength(1);

		const json = JSON.stringify(data);
		expect(json).not.toContain('super-secret-argon2-hash');
		expect(json).not.toContain('password_hash');
		expect(json).not.toContain('passwordHash');
		expect(json).not.toContain('session');

		const parsed = JSON.parse(json);
		expect(parsed).toEqual(JSON.parse(JSON.stringify(data)));
	});

	it('includes soft-deleted rows with their deletedAt flag set', () => {
		const db = createTestDb();

		const user = db
			.insert(users)
			.values({
				username: 'bob',
				displayName: 'Bob',
				passwordHash: 'hash',
				createdAt: now
			})
			.returning({ id: users.id })
			.get();

		const entry = db
			.insert(entries)
			.values({
				type: 'souvenir',
				title: 'Supprime',
				startSort: '2021-01-01',
				startPrecision: 'day',
				createdBy: user.id,
				createdAt: now,
				updatedAt: now,
				deletedAt: now
			})
			.returning({ id: entries.id })
			.get();

		const data = exportAll(db);
		const exported = data.entries.find((e) => e.id === entry.id);
		expect(exported?.deletedAt).toBe(now);
	});
});

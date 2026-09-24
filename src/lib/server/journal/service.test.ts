import { describe, expect, it } from 'vitest';
import type { Db } from '../db';
import { createTestDb } from '../db/test-db';
import { users } from '../db/schema';
import { HttpError } from '../http-error';
import {
	getDay,
	listCalendar,
	softDeleteJournal,
	updateEntryById,
	upsertOwnEntry
} from './service';

const TZ = 'Europe/Paris';
const NOW = new Date('2026-06-15T12:00:00Z').getTime();

function insertUser(db: Db, username: string, displayName: string): number {
	return db
		.insert(users)
		.values({
			username,
			displayName,
			passwordHash: 'hash',
			createdAt: NOW
		})
		.returning({ id: users.id })
		.get().id;
}

describe('getDay / upsertOwnEntry', () => {
	it('lets both users write their own entry for the same day without conflict (EC-7)', () => {
		const db = createTestDb();
		const alice = insertUser(db, 'alice', 'Alice');
		const bob = insertUser(db, 'bob', 'Bob');

		upsertOwnEntry(db, alice, '2026-06-10', { text: 'Journée A', mood: '🙂' }, TZ, NOW);
		upsertOwnEntry(db, bob, '2026-06-10', { text: 'Journée B', mood: '😐' }, TZ, NOW);

		const result = getDay(db, '2026-06-10', TZ, NOW);
		expect(result.day).toBe('2026-06-10');
		expect(result.isFuture).toBe(false);
		expect(result.entries).toHaveLength(2);
		expect(result.entries.map((e) => e.authorName).sort()).toEqual(['Alice', 'Bob']);
	});

	it('updates rather than duplicates when the same user writes the same day twice', () => {
		const db = createTestDb();
		const alice = insertUser(db, 'alice', 'Alice');

		upsertOwnEntry(db, alice, '2026-06-10', { text: 'Premier jet' }, TZ, NOW);
		upsertOwnEntry(db, alice, '2026-06-10', { text: 'Version finale', mood: '🥰' }, TZ, NOW);

		const result = getDay(db, '2026-06-10', TZ, NOW);
		expect(result.entries).toHaveLength(1);
		expect(result.entries[0].text).toBe('Version finale');
		expect(result.entries[0].mood).toBe('🥰');
	});

	it('rejects a future day with 400 (FR-17, EC-7)', () => {
		const db = createTestDb();
		const alice = insertUser(db, 'alice', 'Alice');

		expect(() => upsertOwnEntry(db, alice, '2026-06-16', { text: 'Demain' }, TZ, NOW)).toThrow(
			HttpError
		);
		try {
			upsertOwnEntry(db, alice, '2026-06-16', { text: 'Demain' }, TZ, NOW);
			expect.unreachable();
		} catch (err) {
			expect(err).toBeInstanceOf(HttpError);
			expect((err as HttpError).status).toBe(400);
		}
	});

	it('reports isFuture for a day after today', () => {
		const db = createTestDb();
		const result = getDay(db, '2026-06-16', TZ, NOW);
		expect(result.isFuture).toBe(true);
	});

	it('rejects an invalid mood with 400', () => {
		const db = createTestDb();
		const alice = insertUser(db, 'alice', 'Alice');

		expect(() =>
			upsertOwnEntry(db, alice, '2026-06-10', { text: 'x', mood: '👻' }, TZ, NOW)
		).toThrow(HttpError);
	});
});

describe('day validation', () => {
	it.each(['', '2026-13-45', '2026-02-30'])('rejects invalid day %j in getDay with 400', (day) => {
		const db = createTestDb();
		expect(() => getDay(db, day, TZ, NOW)).toThrow(HttpError);
		try {
			getDay(db, day, TZ, NOW);
			expect.unreachable();
		} catch (err) {
			expect(err).toBeInstanceOf(HttpError);
			expect((err as HttpError).status).toBe(400);
		}
	});

	it.each(['', '2026-13-45', '2026-02-30'])(
		'rejects invalid day %j in upsertOwnEntry with 400',
		(day) => {
			const db = createTestDb();
			const alice = insertUser(db, 'alice', 'Alice');

			expect(() => upsertOwnEntry(db, alice, day, { text: 'x' }, TZ, NOW)).toThrow(HttpError);
			try {
				upsertOwnEntry(db, alice, day, { text: 'x' }, TZ, NOW);
				expect.unreachable();
			} catch (err) {
				expect(err).toBeInstanceOf(HttpError);
				expect((err as HttpError).status).toBe(400);
			}
		}
	);
});

describe('updateEntryById', () => {
	it("rejects editing another user's entry with 403 (EC-8)", () => {
		const db = createTestDb();
		const alice = insertUser(db, 'alice', 'Alice');
		const bob = insertUser(db, 'bob', 'Bob');
		const id = upsertOwnEntry(db, alice, '2026-06-10', { text: 'Journée A' }, TZ, NOW);

		expect(() => updateEntryById(db, id, bob, { text: 'Modifié par Bob' }, NOW)).toThrow(HttpError);
		try {
			updateEntryById(db, id, bob, { text: 'Modifié par Bob' }, NOW);
			expect.unreachable();
		} catch (err) {
			expect(err).toBeInstanceOf(HttpError);
			expect((err as HttpError).status).toBe(403);
		}
	});

	it('lets the author update their own entry', () => {
		const db = createTestDb();
		const alice = insertUser(db, 'alice', 'Alice');
		const id = upsertOwnEntry(db, alice, '2026-06-10', { text: 'Original' }, TZ, NOW);

		updateEntryById(db, id, alice, { text: 'Mis à jour' }, NOW);

		const result = getDay(db, '2026-06-10', TZ, NOW);
		expect(result.entries[0].text).toBe('Mis à jour');
	});
});

describe('softDeleteJournal', () => {
	it("rejects deleting another user's entry with 403", () => {
		const db = createTestDb();
		const alice = insertUser(db, 'alice', 'Alice');
		const bob = insertUser(db, 'bob', 'Bob');
		const id = upsertOwnEntry(db, alice, '2026-06-10', { text: 'Journée A' }, TZ, NOW);

		expect(() => softDeleteJournal(db, id, bob, NOW)).toThrow(HttpError);
	});

	it('hides the entry from getDay once deleted by its author', () => {
		const db = createTestDb();
		const alice = insertUser(db, 'alice', 'Alice');
		const id = upsertOwnEntry(db, alice, '2026-06-10', { text: 'Journée A' }, TZ, NOW);

		softDeleteJournal(db, id, alice, NOW);

		const result = getDay(db, '2026-06-10', TZ, NOW);
		expect(result.entries).toHaveLength(0);
	});
});

describe('listCalendar', () => {
	it('lists days with their authors (FR-15, FR-16, FR-19)', () => {
		const db = createTestDb();
		const alice = insertUser(db, 'alice', 'Alice');
		const bob = insertUser(db, 'bob', 'Bob');

		upsertOwnEntry(db, alice, '2026-06-01', { text: 'a' }, TZ, NOW);
		upsertOwnEntry(db, bob, '2026-06-01', { text: 'b' }, TZ, NOW);
		upsertOwnEntry(db, alice, '2026-06-05', { text: 'c' }, TZ, NOW);

		const result = listCalendar(db, '2026-06-01', '2026-06-30');

		expect(result).toEqual([
			{
				day: '2026-06-01',
				authors: [
					{ userId: alice, displayName: 'Alice' },
					{ userId: bob, displayName: 'Bob' }
				]
			},
			{ day: '2026-06-05', authors: [{ userId: alice, displayName: 'Alice' }] }
		]);
	});

	it('excludes soft-deleted entries', () => {
		const db = createTestDb();
		const alice = insertUser(db, 'alice', 'Alice');
		const id = upsertOwnEntry(db, alice, '2026-06-01', { text: 'a' }, TZ, NOW);
		softDeleteJournal(db, id, alice, NOW);

		const result = listCalendar(db, '2026-06-01', '2026-06-30');
		expect(result).toEqual([]);
	});
});

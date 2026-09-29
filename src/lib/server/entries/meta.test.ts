import { describe, expect, it } from 'vitest';
import { formatStamp } from '../../dates/format';
import { users } from '../db/schema';
import { createTestDb } from '../db/test-db';
import { getEntryMeta } from './meta';

const created = Date.UTC(2024, 0, 5, 12);
const updated = Date.UTC(2024, 5, 20, 12);
const tz = 'Europe/Paris';

function insertUser(db: ReturnType<typeof createTestDb>, username: string, displayName: string) {
	return db
		.insert(users)
		.values({ username, displayName, passwordHash: 'x', createdAt: created })
		.returning({ id: users.id })
		.get().id;
}

describe('getEntryMeta', () => {
	it('resolves display names and formats stamps', () => {
		const db = createTestDb();
		const alice = insertUser(db, 'alice', 'Alice');
		const bob = insertUser(db, 'bob', 'Bob');

		expect(
			getEntryMeta(
				db,
				{ createdBy: alice, updatedBy: bob, createdAt: created, updatedAt: updated },
				tz
			)
		).toEqual({
			createdBy: 'Alice',
			createdAt: formatStamp(created, tz),
			updatedBy: 'Bob',
			updatedAt: formatStamp(updated, tz)
		});
	});

	it('falls back to "un ancien utilisateur" for unknown users', () => {
		const db = createTestDb();
		const alice = insertUser(db, 'alice', 'Alice');

		const meta = getEntryMeta(
			db,
			{ createdBy: alice, updatedBy: 9999, createdAt: created, updatedAt: updated },
			tz
		);
		expect(meta.createdBy).toBe('Alice');
		expect(meta.updatedBy).toBe('un ancien utilisateur');
	});

	it('falls back for null createdBy/updatedBy (deleted users)', () => {
		const db = createTestDb();

		const meta = getEntryMeta(
			db,
			{ createdBy: null, updatedBy: null, createdAt: created, updatedAt: updated },
			tz
		);
		expect(meta.createdBy).toBe('un ancien utilisateur');
		expect(meta.updatedBy).toBe('un ancien utilisateur');
	});
});

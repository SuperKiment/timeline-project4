import { sql } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { createTestDb } from '../db/test-db';
import { HISTOIRE_ITEMS, seedHistoire } from './histoire';

describe('seedHistoire', () => {
	it('inserts at least 15 histoire entries', () => {
		const db = createTestDb();

		const count = seedHistoire(db);

		expect(count).toBeGreaterThanOrEqual(15);
		expect(count).toBe(HISTOIRE_ITEMS.length);
	});

	it('is idempotent: a second run does not duplicate rows', () => {
		const db = createTestDb();

		const first = seedHistoire(db);
		const second = seedHistoire(db);

		expect(second).toBe(first);
	});

	it('uses stable, unique seed_key values', () => {
		const db = createTestDb();
		seedHistoire(db);

		const keys = HISTOIRE_ITEMS.map((item) => item.seedKey);
		expect(new Set(keys).size).toBe(keys.length);

		const row = db.get<{ count: number }>(
			sql`select count(distinct seed_key) as count from entries where type = 'histoire'`
		);
		expect(row.count).toBe(keys.length);
	});

	it('re-adds a seed_key once its row has been hard-deleted (purged)', () => {
		// Per Conventions, only a *soft* delete is permanent-looking; once a row is
		// actually purged (hard-deleted) the seed_key is free again and re-seeding
		// is allowed to recreate it (EC-17: "acceptable").
		const db = createTestDb();
		seedHistoire(db);

		db.run(sql`delete from entries where seed_key = 'chatgpt'`);

		const countAfterPurge = db.get<{ count: number }>(
			sql`select count(*) as count from entries where type = 'histoire'`
		).count;
		expect(countAfterPurge).toBe(HISTOIRE_ITEMS.length - 1);

		const countAfterReseed = seedHistoire(db);

		expect(countAfterReseed).toBe(HISTOIRE_ITEMS.length);
	});
});

import { createDb, type Db } from './index';
import { runMigrations } from './migrate';

/**
 * Fresh, fully migrated in-memory database for tests. Each call returns an
 * independent instance (no state shared between tests).
 */
export function createTestDb(): Db {
	const db = createDb(':memory:');
	runMigrations(db);
	return db;
}

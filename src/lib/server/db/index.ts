import fs from 'node:fs';
import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import { getConfig } from '../config';
import * as schema from './schema';

export type Db = BetterSQLite3Database<typeof schema>;

/**
 * Opens (creating if needed) the SQLite file at `dbPath` (or `:memory:` for
 * tests) with WAL journaling, foreign keys enforced and a busy timeout, and
 * wraps it in a Drizzle client. Tuned for an SD card: `synchronous = NORMAL`
 * (no fsync per commit; with WAL a power cut may lose the last commits but
 * never corrupts the file), a 16 MB page cache, in-memory temp tables and
 * 64 MiB of memory-mapped reads. Does not run migrations — callers do that
 * explicitly via `runMigrations` (see `./migrate`).
 */
export function createDb(dbPath: string): Db {
	const sqlite = new Database(dbPath);
	sqlite.pragma('journal_mode = WAL');
	sqlite.pragma('foreign_keys = ON');
	sqlite.pragma('busy_timeout = 5000');
	sqlite.pragma('synchronous = NORMAL');
	sqlite.pragma('cache_size = -16000');
	sqlite.pragma('temp_store = MEMORY');
	if (dbPath !== ':memory:') sqlite.pragma('mmap_size = 67108864');
	return drizzle(sqlite, { schema });
}

let dbSingleton: Db | undefined;

/**
 * Lazy singleton client for the app's configured database (`config.dbPath`),
 * creating `DATA_DIR` on first use if it doesn't exist yet. Routes and
 * services call this; tests use `createTestDb()` instead.
 */
export function getDb(): Db {
	if (!dbSingleton) {
		const config = getConfig();
		fs.mkdirSync(config.dataDir, { recursive: true });
		dbSingleton = createDb(config.dbPath);
	}
	return dbSingleton;
}

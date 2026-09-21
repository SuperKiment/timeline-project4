import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import type { Db } from './index';

/**
 * Applies all pending migrations from `./drizzle` (resolved relative to the
 * process's current working directory, i.e. the project root — matches
 * `getConfig()`'s own `./data`/`./backups` resolution) to `db`.
 */
export function runMigrations(db: Db): void {
	migrate(db, { migrationsFolder: './drizzle' });
}

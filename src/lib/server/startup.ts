import { sql } from 'drizzle-orm';
import { getDb } from './db';
import { runMigrations } from './db/migrate';
import { purgeExpired } from './trash/service';

const MAINTENANCE_INTERVAL_MS = 24 * 60 * 60 * 1000;

let started = false;

/**
 * Purges expired trash and sessions, then refreshes the query planner's
 * statistics (`PRAGMA optimize`, all tables); never throws (must not crash
 * the process).
 */
async function runMaintenance(): Promise<void> {
	try {
		await purgeExpired(getDb(), Date.now());
	} catch (err) {
		console.error('Purge de la corbeille échouée', err);
	}
	try {
		getDb().run(sql`PRAGMA optimize = 0x10002`);
	} catch (err) {
		console.error('PRAGMA optimize échoué', err);
	}
}

/**
 * Runs the app's startup tasks exactly once per process: applies pending DB
 * migrations against the configured database, runs maintenance (trash purge,
 * `PRAGMA optimize`) once and schedules it every 24h. Safe to call on every
 * request (e.g. from `hooks.server.ts`) — a no-op after the first success.
 * The flag is only set once migrations succeed, so a failure is retried on
 * the next call and the error propagates to the caller.
 */
export function runStartup(): void {
	if (started) return;
	runMigrations(getDb());
	started = true;
	void runMaintenance();
	setInterval(() => void runMaintenance(), MAINTENANCE_INTERVAL_MS).unref();
}

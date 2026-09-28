import { getDb } from './db';
import { runMigrations } from './db/migrate';
import { purgeExpired } from './trash/service';

const PURGE_INTERVAL_MS = 24 * 60 * 60 * 1000;

let started = false;

/** Purges expired trash and sessions; never throws (must not crash the process). */
async function runPurge(): Promise<void> {
	try {
		await purgeExpired(getDb(), Date.now());
	} catch (err) {
		console.error('Purge de la corbeille échouée', err);
	}
}

/**
 * Runs the app's startup tasks exactly once per process: applies pending DB
 * migrations against the configured database, purges expired trash once and
 * schedules the purge every 24h. Safe to call on every request (e.g. from
 * `hooks.server.ts`) — a no-op after the first success. The flag is only set
 * once migrations succeed, so a failure is retried on the next call and the
 * error propagates to the caller.
 */
export function runStartup(): void {
	if (started) return;
	runMigrations(getDb());
	started = true;
	void runPurge();
	setInterval(() => void runPurge(), PURGE_INTERVAL_MS).unref();
}

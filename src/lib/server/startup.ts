import { getDb } from './db';
import { runMigrations } from './db/migrate';

let started = false;

/**
 * Runs the app's startup tasks exactly once per process: applies pending DB
 * migrations against the configured database. Safe to call on every
 * request (e.g. from `hooks.server.ts`) — a no-op after the first success.
 * The flag is only set once migrations succeed, so a failure is retried on
 * the next call and the error propagates to the caller.
 */
export function runStartup(): void {
	if (started) return;
	runMigrations(getDb());
	started = true;
}

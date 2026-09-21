import path from 'node:path';

export interface Config {
	host: string;
	port: number;
	origin: string | undefined;
	dataDir: string;
	tz: string;
	backupDir: string;
	sessionDays: number;
	dbPath: string;
	mediaDir: string;
	tmpDir: string;
}

function parsePositiveInt(name: string, value: string): number {
	const n = Number(value);
	if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) {
		throw new Error(`${name} must be a positive integer, got "${value}"`);
	}
	return n;
}

/**
 * Reads configuration from `process.env` on every call (no caching) so that
 * tests can mutate `process.env` between calls. Never imports `$env/*` or
 * `$app/*` so this module can also be used from `scripts/*` run with `tsx`.
 * Empty env values are treated the same as unset (fall back to defaults).
 */
export function getConfig(): Config {
	const host = process.env.HOST || '0.0.0.0';
	const port = process.env.PORT ? parsePositiveInt('PORT', process.env.PORT) : 3000;
	const origin = process.env.ORIGIN || undefined;
	const dataDir = path.resolve(process.env.DATA_DIR || './data');
	const tz = process.env.TZ || 'Europe/Paris';
	const backupDir = path.resolve(process.env.BACKUP_DIR || './backups');
	const sessionDays = process.env.SESSION_DAYS
		? parsePositiveInt('SESSION_DAYS', process.env.SESSION_DAYS)
		: 30;

	return {
		host,
		port,
		origin,
		dataDir,
		tz,
		backupDir,
		sessionDays,
		dbPath: path.join(dataDir, 'timeline.sqlite'),
		mediaDir: path.join(dataDir, 'media'),
		tmpDir: path.join(dataDir, 'tmp')
	};
}

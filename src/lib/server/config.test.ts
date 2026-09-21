import { afterEach, describe, expect, it } from 'vitest';
import path from 'node:path';
import { getConfig } from './config';

const ENV_KEYS = [
	'HOST',
	'PORT',
	'ORIGIN',
	'DATA_DIR',
	'TZ',
	'BACKUP_DIR',
	'SESSION_DAYS'
] as const;

const savedEnv: Record<string, string | undefined> = {};
for (const key of ENV_KEYS) {
	savedEnv[key] = process.env[key];
}

afterEach(() => {
	for (const key of ENV_KEYS) {
		if (savedEnv[key] === undefined) {
			delete process.env[key];
		} else {
			process.env[key] = savedEnv[key];
		}
	}
});

describe('getConfig', () => {
	it('applies defaults when env vars are unset', () => {
		for (const key of ENV_KEYS) {
			delete process.env[key];
		}

		const config = getConfig();

		expect(config.host).toBe('0.0.0.0');
		expect(config.port).toBe(3000);
		expect(config.origin).toBeUndefined();
		expect(config.dataDir).toBe(path.resolve('./data'));
		expect(config.tz).toBe('Europe/Paris');
		expect(config.backupDir).toBe(path.resolve('./backups'));
		expect(config.sessionDays).toBe(30);
		expect(config.dbPath).toBe(path.join(config.dataDir, 'timeline.sqlite'));
		expect(config.mediaDir).toBe(path.join(config.dataDir, 'media'));
		expect(config.tmpDir).toBe(path.join(config.dataDir, 'tmp'));
	});

	it('honors overrides and resolves DATA_DIR to an absolute path', () => {
		process.env.HOST = '127.0.0.1';
		process.env.PORT = '4000';
		process.env.ORIGIN = 'https://timeline.example.com';
		process.env.DATA_DIR = 'relative/data';
		process.env.TZ = 'UTC';
		process.env.BACKUP_DIR = './my-backups';
		process.env.SESSION_DAYS = '7';

		const config = getConfig();

		expect(config.host).toBe('127.0.0.1');
		expect(config.port).toBe(4000);
		expect(config.origin).toBe('https://timeline.example.com');
		expect(config.dataDir).toBe(path.resolve('relative/data'));
		expect(path.isAbsolute(config.dataDir)).toBe(true);
		expect(config.tz).toBe('UTC');
		expect(config.backupDir).toBe(path.resolve('./my-backups'));
		expect(path.isAbsolute(config.backupDir)).toBe(true);
		expect(config.sessionDays).toBe(7);
		expect(config.dbPath).toBe(path.join(config.dataDir, 'timeline.sqlite'));
		expect(config.mediaDir).toBe(path.join(config.dataDir, 'media'));
		expect(config.tmpDir).toBe(path.join(config.dataDir, 'tmp'));
	});

	it('treats an empty ORIGIN as unset', () => {
		process.env.ORIGIN = '';

		const config = getConfig();

		expect(config.origin).toBeUndefined();
	});

	it('treats an empty TZ as unset and falls back to the default', () => {
		process.env.TZ = '';

		const config = getConfig();

		expect(config.tz).toBe('Europe/Paris');
	});

	it('resolves backupDir to an absolute path like dataDir', () => {
		process.env.BACKUP_DIR = 'relative/backups';

		const config = getConfig();

		expect(config.backupDir).toBe(path.resolve('relative/backups'));
		expect(path.isAbsolute(config.backupDir)).toBe(true);
	});

	it('throws a clear error when PORT is set but not a finite positive integer', () => {
		process.env.PORT = 'not-a-number';

		expect(() => getConfig()).toThrow(/PORT/);
	});

	it('throws a clear error when SESSION_DAYS is set but not a finite positive integer', () => {
		process.env.SESSION_DAYS = '-1';

		expect(() => getConfig()).toThrow(/SESSION_DAYS/);
	});
});

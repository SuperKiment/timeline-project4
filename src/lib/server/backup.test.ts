import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import * as tar from 'tar';
import { afterEach, describe, expect, it } from 'vitest';
import { createBackup } from './backup';
import { createDb } from './db';
import { runMigrations } from './db/migrate';
import { entries } from './db/schema';

describe('createBackup', () => {
	let workDir: string;

	afterEach(() => {
		if (workDir) fs.rmSync(workDir, { recursive: true, force: true });
	});

	it('archives a VACUUM INTO db snapshot and the media directory', async () => {
		workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'timeline-backup-test-'));
		const dbPath = path.join(workDir, 'timeline.sqlite');
		const mediaDir = path.join(workDir, 'media');
		const backupDir = path.join(workDir, 'backups');
		fs.mkdirSync(mediaDir, { recursive: true });
		fs.writeFileSync(path.join(mediaDir, 'photo.jpg'), 'fake-image-bytes');

		const db = createDb(dbPath);
		runMigrations(db);
		const now = Date.now();
		await db.insert(entries).values({
			type: 'souvenir',
			title: 'Test entry',
			startSort: '2020-01-01',
			startPrecision: 'day',
			createdAt: now,
			updatedAt: now
		});

		const archivePath = await createBackup({
			dbPath,
			mediaDir,
			backupDir,
			now: new Date(2024, 2, 5, 14, 7, 9)
		});

		expect(archivePath).toBe(path.join(backupDir, 'timeline-20240305-140709.tar.gz'));
		expect(fs.existsSync(archivePath)).toBe(true);

		const extractDir = path.join(workDir, 'extracted');
		fs.mkdirSync(extractDir, { recursive: true });
		await tar.x({ file: archivePath, cwd: extractDir });

		const extractedDbPath = path.join(extractDir, 'timeline.sqlite');
		expect(fs.existsSync(extractedDbPath)).toBe(true);
		const extractedDb = new Database(extractedDbPath, { readonly: true });
		const row = extractedDb.prepare('SELECT title FROM entries').get() as { title: string };
		expect(row.title).toBe('Test entry');
		extractedDb.close();

		expect(fs.readFileSync(path.join(extractDir, 'media', 'photo.jpg'), 'utf8')).toBe(
			'fake-image-bytes'
		);
	});

	it('creates backupDir and an empty media/ entry when there is no media yet', async () => {
		workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'timeline-backup-test-empty-'));
		const dbPath = path.join(workDir, 'timeline.sqlite');
		const mediaDir = path.join(workDir, 'media');
		const backupDir = path.join(workDir, 'nested', 'backups');

		const db = createDb(dbPath);
		runMigrations(db);

		const archivePath = await createBackup({ dbPath, mediaDir, backupDir });

		expect(fs.existsSync(archivePath)).toBe(true);
		expect(fs.existsSync(backupDir)).toBe(true);
	});

	it('creates backupDir with 0700 permissions', async () => {
		workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'timeline-backup-test-perms-'));
		const dbPath = path.join(workDir, 'timeline.sqlite');
		const mediaDir = path.join(workDir, 'media');
		const backupDir = path.join(workDir, 'backups');

		const db = createDb(dbPath);
		runMigrations(db);

		await createBackup({ dbPath, mediaDir, backupDir });

		expect(fs.statSync(backupDir).mode & 0o777).toBe(0o700);
	});

	it.skipIf(process.platform === 'win32')('creates the archive with 0600 permissions', async () => {
		workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'timeline-backup-test-archive-perms-'));
		const dbPath = path.join(workDir, 'timeline.sqlite');
		const mediaDir = path.join(workDir, 'media');
		const backupDir = path.join(workDir, 'backups');

		const db = createDb(dbPath);
		runMigrations(db);

		const archivePath = await createBackup({ dbPath, mediaDir, backupDir });

		expect(fs.statSync(archivePath).mode & 0o777).toBe(0o600);
	});

	it('does not leave a .part file behind after a successful backup', async () => {
		workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'timeline-backup-test-part-'));
		const dbPath = path.join(workDir, 'timeline.sqlite');
		const mediaDir = path.join(workDir, 'media');
		const backupDir = path.join(workDir, 'backups');

		const db = createDb(dbPath);
		runMigrations(db);

		const archivePath = await createBackup({ dbPath, mediaDir, backupDir });

		// No leftover `.part` file and no leftover staging directory: the only
		// thing left behind in backupDir is the finished archive.
		expect(fs.readdirSync(backupDir)).toEqual([path.basename(archivePath)]);
	});

	it('removes the staging directory from backupDir when the backup fails', async () => {
		workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'timeline-backup-test-fail-'));
		const dbPath = path.join(workDir, 'does-not-exist.sqlite');
		const mediaDir = path.join(workDir, 'media');
		const backupDir = path.join(workDir, 'backups');

		await expect(createBackup({ dbPath, mediaDir, backupDir })).rejects.toThrow();

		expect(fs.readdirSync(backupDir)).toEqual([]);
	});

	it('resolves a symlinked mediaDir and archives its real contents under media/', async () => {
		workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'timeline-backup-test-media-symlink-'));
		const dbPath = path.join(workDir, 'timeline.sqlite');
		const mediaDir = path.join(workDir, 'media');
		const backupDir = path.join(workDir, 'backups');

		const realMediaDir = fs.mkdtempSync(path.join(os.tmpdir(), 'timeline-backup-real-media-'));
		fs.writeFileSync(path.join(realMediaDir, 'photo.jpg'), 'fake-image-bytes');
		fs.symlinkSync(realMediaDir, mediaDir, 'dir');

		const db = createDb(dbPath);
		runMigrations(db);

		try {
			const archivePath = await createBackup({ dbPath, mediaDir, backupDir });

			const extractDir = path.join(workDir, 'extracted');
			fs.mkdirSync(extractDir, { recursive: true });
			await tar.x({ file: archivePath, cwd: extractDir });

			expect(fs.readFileSync(path.join(extractDir, 'media', 'photo.jpg'), 'utf8')).toBe(
				'fake-image-bytes'
			);
		} finally {
			fs.rmSync(realMediaDir, { recursive: true, force: true });
		}
	});

	it('stores a symlink inside media as a symlink instead of dereferencing it', async () => {
		workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'timeline-backup-test-symlink-'));
		const dbPath = path.join(workDir, 'timeline.sqlite');
		const mediaDir = path.join(workDir, 'media');
		const backupDir = path.join(workDir, 'backups');
		fs.mkdirSync(mediaDir, { recursive: true });

		const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), 'timeline-backup-outside-'));
		const secretPath = path.join(outsideDir, 'secret.txt');
		fs.writeFileSync(secretPath, 'outside-data-dir-secret');

		const linkPath = path.join(mediaDir, 'escape-link');
		fs.symlinkSync(secretPath, linkPath, 'file');

		const db = createDb(dbPath);
		runMigrations(db);

		try {
			const archivePath = await createBackup({ dbPath, mediaDir, backupDir });

			const listedEntries: { path: string; type?: string }[] = [];
			await tar.t({
				file: archivePath,
				onReadEntry: (entry) => listedEntries.push({ path: entry.path, type: entry.type })
			});

			const linkEntry = listedEntries.find((e) => e.path === 'media/escape-link');
			expect(linkEntry).toBeDefined();
			expect(linkEntry?.type).toBe('SymbolicLink');

			const extractDir = path.join(workDir, 'extracted');
			fs.mkdirSync(extractDir, { recursive: true });
			await tar.x({ file: archivePath, cwd: extractDir, preservePaths: true });

			const extractedLink = path.join(extractDir, 'media', 'escape-link');
			const stat = fs.lstatSync(extractedLink);
			expect(stat.isSymbolicLink()).toBe(true);
		} finally {
			fs.rmSync(outsideDir, { recursive: true, force: true });
		}
	});
});

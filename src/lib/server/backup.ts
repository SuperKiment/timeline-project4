import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import zlib from 'node:zlib';
import Database from 'better-sqlite3';
import * as tar from 'tar';

export interface CreateBackupOptions {
	dbPath: string;
	mediaDir: string;
	backupDir: string;
	now?: Date;
}

function pad(n: number, width = 2): string {
	return String(n).padStart(width, '0');
}

function formatTimestamp(now: Date): string {
	const year = now.getFullYear();
	const month = pad(now.getMonth() + 1);
	const day = pad(now.getDate());
	const hours = pad(now.getHours());
	const minutes = pad(now.getMinutes());
	const seconds = pad(now.getSeconds());
	return `${year}${month}${day}-${hours}${minutes}${seconds}`;
}

/**
 * Consistent, crash-safe snapshot of the SQLite database at `dbPath` written
 * to `targetPath` via `VACUUM INTO`, which only needs read access on the
 * source (safe to run alongside the live app) and write access on the
 * destination directory.
 */
function vacuumInto(dbPath: string, targetPath: string): void {
	const sqlite = new Database(dbPath, { readonly: true, fileMustExist: true });
	try {
		sqlite.prepare('VACUUM INTO ?').run(targetPath);
	} finally {
		sqlite.close();
	}
}

/**
 * Ensures `dir` exists with owner-only (0700) permissions. Leaves an
 * already-existing directory's permissions untouched, but if it has to be
 * created, chmods it explicitly since `fs.mkdirSync`'s `mode` option is
 * subject to the process umask.
 */
function ensurePrivateDir(dir: string): void {
	const existed = fs.existsSync(dir);
	fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
	if (!existed) {
		fs.chmodSync(dir, 0o700);
	}
}

/**
 * Builds a `timeline-YYYYMMDD-HHmmss.tar.gz` archive in `backupDir`
 * containing a consistent snapshot of the SQLite database (`timeline.sqlite`,
 * via `VACUUM INTO`) plus the whole `media/` directory. The archive holds
 * password hashes, sessions and private journal content, so `backupDir` is
 * created owner-only (0700) if missing and the finished archive is chmod'd
 * 0600. The archive is written atomically: built as `<name>.tar.gz.<pid>-
 * <random>.part` (the unique suffix lets two backups started in the same
 * second coexist) then renamed into place, with the `.part` file removed on
 * failure.
 *
 * Staging (the sqlite snapshot and the uncompressed intermediate tar) is
 * done in a private (0700) subdirectory of `backupDir` rather than
 * `os.tmpdir()`, so it shares a filesystem with the final archive — on
 * small devices (e.g. a Pi) `/tmp` is often a size-limited tmpfs that can't
 * hold a multi-gigabyte media library. The staging directory is removed in
 * `finally`, including on failure.
 *
 * `mediaDir` itself may be a symlink (e.g. media stored on another disk),
 * so it's resolved with `fs.realpathSync` and its contents are archived
 * under the `media/` entry name via tar's `prefix` option. Both passes are
 * built with `follow: false`, so symlinks found inside `media/` are stored
 * as symlinks rather than dereferenced — following them could pull file
 * contents from outside `DATA_DIR` into the backup. Resolves with the
 * absolute path of the archive (FR-26, AC-12).
 */
export async function createBackup({
	dbPath,
	mediaDir,
	backupDir,
	now = new Date()
}: CreateBackupOptions): Promise<string> {
	ensurePrivateDir(backupDir);

	const uniqueSuffix = `${process.pid}-${crypto.randomBytes(6).toString('hex')}`;
	const stagingDir = path.join(backupDir, `.timeline-backup-staging-${uniqueSuffix}`);
	ensurePrivateDir(stagingDir);

	const archivePath = path.join(backupDir, `timeline-${formatTimestamp(now)}.tar.gz`);
	const partPath = `${archivePath}.${uniqueSuffix}.part`;

	try {
		const snapshotPath = path.join(stagingDir, 'timeline.sqlite');
		vacuumInto(dbPath, snapshotPath);

		// Build a plain (uncompressed) tar in two passes instead of staging a
		// `media` symlink and using `follow: true`: the snapshot lives outside
		// `mediaDir`, so it can't share a single `cwd` with it, and following
		// symlinks would also dereference any symlink found inside `media/`.
		const tarPath = path.join(stagingDir, 'staging.tar');
		await tar.c({ file: tarPath, cwd: stagingDir, follow: false, portable: true }, [
			'timeline.sqlite'
		]);

		const realMediaDir = fs.existsSync(mediaDir) ? fs.realpathSync(mediaDir) : undefined;
		const mediaEntries = realMediaDir ? fs.readdirSync(realMediaDir) : [];

		if (realMediaDir && mediaEntries.length > 0) {
			// `cwd` is the resolved (non-symlink) directory so `follow: false`
			// only affects symlinks found inside it, not `mediaDir` itself; the
			// `prefix` option puts its contents under the `media/` entry name
			// regardless of `mediaDir`'s (or its target's) actual basename.
			await tar.r(
				{ file: tarPath, cwd: realMediaDir, follow: false, portable: true, prefix: 'media' },
				mediaEntries
			);
		} else {
			const emptyMediaDir = path.join(stagingDir, 'media');
			fs.mkdirSync(emptyMediaDir, { recursive: true });
			await tar.r({ file: tarPath, cwd: stagingDir, follow: false, portable: true }, ['media']);
		}

		await pipeline(
			fs.createReadStream(tarPath),
			zlib.createGzip(),
			fs.createWriteStream(partPath, { mode: 0o600 })
		);
		fs.chmodSync(partPath, 0o600);
		fs.renameSync(partPath, archivePath);

		return archivePath;
	} catch (err) {
		fs.rmSync(partPath, { force: true });
		throw err;
	} finally {
		fs.rmSync(stagingDir, { recursive: true, force: true });
	}
}

import { randomBytes } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { getConfig } from '../config';

/** Generates a random, server-side file name (no client-provided name in the path, FR-23). */
export function newStoredName(ext: string): string {
	const cleanExt = ext.replace(/^\./, '').toLowerCase();
	return `${randomBytes(16).toString('hex')}.${cleanExt}`;
}

/**
 * Resolves a stored media file name to an absolute path inside `mediaDir`,
 * refusing anything that would escape it (path traversal, NFR-4).
 */
export function mediaPath(name: string): string {
	const mediaDir = getConfig().mediaDir;
	const resolved = path.resolve(mediaDir, name);
	const mediaDirWithSep = mediaDir.endsWith(path.sep) ? mediaDir : mediaDir + path.sep;
	// Must resolve to something strictly inside mediaDir: reject traversal
	// (`../x`) as well as names resolving to mediaDir itself (`''`, `.`).
	if (resolved === mediaDir || !resolved.startsWith(mediaDirWithSep)) {
		throw new Error('Chemin de fichier invalide.');
	}
	return resolved;
}

/** Ensures `mediaDir` exists before files are written into it. */
export async function ensureMediaDir(): Promise<void> {
	await fs.mkdir(getConfig().mediaDir, { recursive: true });
}

export interface StoredMediaFiles {
	storedName: string;
	thumbName?: string | null;
	posterName?: string | null;
}

/** Deletes a media row's files from disk, silently ignoring files already gone. */
export async function removeMediaFiles(files: StoredMediaFiles): Promise<void> {
	const names = [files.storedName, files.thumbName, files.posterName].filter(
		(name): name is string => !!name
	);
	await Promise.all(
		names.map(async (name) => {
			try {
				await fs.unlink(mediaPath(name));
			} catch (err) {
				if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
					throw err;
				}
			}
		})
	);
}

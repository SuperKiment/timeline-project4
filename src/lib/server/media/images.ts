import { promises as fs } from 'node:fs';
import sharp, { type Sharp } from 'sharp';
// heic-convert ships no type declarations.
// @ts-expect-error - untyped module, see comment above
import heicConvert from 'heic-convert';
import { MediaError, type SniffResult } from './validate';
import { ensureMediaDir, mediaPath, newStoredName, removeMediaFiles } from './storage';

const THUMB_WIDTH = 400;

/** Decompression-bomb guard: reject images (or HEIC sources) above this pixel count. */
const MAX_PIXELS = 50_000_000;

type PhotoExt = 'jpg' | 'png' | 'webp';

function encode(pipeline: Sharp, ext: PhotoExt): Sharp {
	switch (ext) {
		case 'jpg':
			return pipeline.jpeg({ quality: 90 });
		case 'png':
			return pipeline.png();
		case 'webp':
			return pipeline.webp({ quality: 90 });
	}
}

/**
 * Whether `err` looks like a sharp/libvips decode failure (plain `Error`,
 * no `code` property) as opposed to a Node.js filesystem error (`ENOSPC`,
 * `EACCES`, ...) which callers may want to inspect and handle differently.
 */
function isDecodeError(err: unknown): boolean {
	return err instanceof Error && !('code' in err && (err as NodeJS.ErrnoException).code);
}

export interface ProcessedPhoto {
	storedName: string;
	thumbName: string;
	/** Final MIME type of the stored original (always `image/jpeg` for HEIC/HEIF input). */
	mime: string;
	/** Dimensions of the stored original, after EXIF auto-orientation. */
	width: number;
	height: number;
}

/**
 * Converts (HEIC/HEIF → JPEG), auto-orients (EXIF) and stores a photo: writes
 * the original (JPEG when converted from HEIC, otherwise re-encoded in its
 * native format) plus a {@link THUMB_WIDTH}px-wide WebP thumbnail to `mediaDir`.
 *
 * Throws {@link MediaError} with a clear French message when the source is
 * not decodable, too large (decompression-bomb guard, EC-9), or when a HEIC
 * file specifically fails to convert (EC-10). On any failure after files
 * were written, already-written files are unlinked before rethrowing (EC-9).
 */
export async function processPhoto(tmpPath: string, sniff: SniffResult): Promise<ProcessedPhoto> {
	// Never trust a caller-provided size: stat the file we are actually about
	// to read.
	const stat = await fs.stat(tmpPath);
	if (stat.size === 0) {
		throw new MediaError('Image illisible.');
	}

	const isHeic = sniff.ext === 'heic' || sniff.ext === 'heif';

	let sourceBuffer: Buffer;
	let ext: PhotoExt;
	let storedMime: string;

	if (isHeic) {
		// Read dimensions before the costly full HEIC decode so a
		// decompression bomb is rejected early (libheif metadata parse, no
		// full pixel decode).
		let width: number;
		let height: number;
		try {
			const meta = await sharp(tmpPath, { limitInputPixels: MAX_PIXELS }).metadata();
			width = meta.width ?? 0;
			height = meta.height ?? 0;
		} catch {
			throw new MediaError('HEIC illisible.');
		}
		if (width * height > MAX_PIXELS) {
			throw new MediaError('Image trop grande.');
		}

		const heicBuffer = await fs.readFile(tmpPath);
		try {
			const converted: ArrayBuffer = await heicConvert({
				buffer: heicBuffer,
				format: 'JPEG',
				quality: 0.92
			});
			sourceBuffer = Buffer.from(converted);
		} catch {
			throw new MediaError('HEIC illisible.');
		}
		ext = 'jpg';
		storedMime = 'image/jpeg';
	} else {
		sourceBuffer = await fs.readFile(tmpPath);
		ext = sniff.ext as PhotoExt;
		storedMime = sniff.mime;
	}

	await ensureMediaDir();
	const storedName = newStoredName(ext);
	const thumbName = newStoredName('webp');

	try {
		const oriented = sharp(sourceBuffer, { limitInputPixels: MAX_PIXELS }).rotate();
		const originalInfo = await encode(oriented.clone(), ext).toFile(mediaPath(storedName));
		await oriented
			.clone()
			.resize({ width: THUMB_WIDTH, withoutEnlargement: true })
			.webp({ quality: 80 })
			.toFile(mediaPath(thumbName));

		return {
			storedName,
			thumbName,
			mime: storedMime,
			width: originalInfo.width,
			height: originalInfo.height
		};
	} catch (err) {
		await removeMediaFiles({ storedName, thumbName });
		if (isDecodeError(err)) {
			throw new MediaError('Image illisible.');
		}
		throw err;
	}
}

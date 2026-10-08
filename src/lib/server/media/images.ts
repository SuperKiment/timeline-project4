import { promises as fs } from 'node:fs';
import sharp, { type OutputInfo, type Sharp } from 'sharp';
import { DISPLAY_MAX_EDGE, THUMB_SM_SIZE, THUMB_WIDTH } from '../../media/variants';
import { decodeHeic, type DecodedHeic } from './heic';
import { MediaError, type SniffResult } from './validate';
import {
	DERIVED_VARIANTS,
	derivedName,
	ensureMediaDir,
	mediaPath,
	newStoredName,
	removeMediaFiles,
	type DerivedVariant
} from './storage';

/** Decompression-bomb guard: reject images (or HEIC sources) above this pixel count. */
const MAX_PIXELS = 50_000_000;

/** Maximum size in bytes of a photo source file (checked before any read/decode). */
export const MAX_PHOTO_BYTES = 50 * 1024 * 1024;

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

/** Encodes the derived variants (see `derivedName`) of an auto-oriented photo. */
async function encodeDerived(oriented: Sharp): Promise<Record<DerivedVariant, Buffer>> {
	return {
		display: await oriented
			.clone()
			.resize({
				width: DISPLAY_MAX_EDGE,
				height: DISPLAY_MAX_EDGE,
				fit: 'inside',
				withoutEnlargement: true
			})
			.webp({ quality: 80 })
			.toBuffer(),
		// Square crop: the timeline card shows it `object-fit: cover`, centered.
		'thumb-sm': await oriented
			.clone()
			.resize({
				width: THUMB_SM_SIZE,
				height: THUMB_SM_SIZE,
				fit: 'cover',
				withoutEnlargement: true
			})
			.webp({ quality: 70 })
			.toBuffer()
	};
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
 * native format), a {@link THUMB_WIDTH}px-wide WebP thumbnail and the derived
 * `display`/`thumb-sm` WebP variants to `mediaDir`.
 *
 * Throws {@link MediaError} with a clear French message when the source is
 * not decodable, too large (decompression-bomb guard, EC-9), or when a HEIC
 * file specifically fails to convert (EC-10). Decoding/encoding happens fully
 * in memory before anything is written to disk, so a filesystem failure while
 * writing the resulting files (e.g. `ENOSPC`, EC-12) is never mistaken for a
 * decode failure and surfaces unchanged instead of a generic
 * `MediaError('Image illisible.')` (F4). On any failure after files were
 * written, already-written files are unlinked before rethrowing (EC-9).
 */
export async function processPhoto(tmpPath: string, sniff: SniffResult): Promise<ProcessedPhoto> {
	// Never trust a caller-provided size: stat the file we are actually about
	// to read.
	const stat = await fs.stat(tmpPath);
	if (stat.size === 0) {
		throw new MediaError('Image illisible.');
	}
	// Photos are read fully into memory (readFile + decode): cap them well below
	// the global upload limit to avoid a memory DoS on small hosts.
	if (stat.size > MAX_PHOTO_BYTES) {
		throw new MediaError('Photo trop volumineuse (max 50 Mo).', 413);
	}

	const isHeic = sniff.ext === 'heic' || sniff.ext === 'heif';

	let source: Sharp;
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
		let decoded: DecodedHeic;
		try {
			// Raw RGBA straight into sharp (worker thread, see decodeHeic): no
			// intermediate JPEG encode/decode.
			decoded = await decodeHeic(heicBuffer);
		} catch {
			throw new MediaError('HEIC illisible.');
		}
		// libheif already applied the HEIF rotation/mirror; there is no EXIF
		// orientation left to honor. Alpha is dropped (stored as JPEG anyway).
		source = sharp(decoded.data, {
			raw: { width: decoded.width, height: decoded.height, channels: 4 },
			limitInputPixels: MAX_PIXELS
		}).removeAlpha();
		ext = 'jpg';
		storedMime = 'image/jpeg';
	} else {
		source = sharp(await fs.readFile(tmpPath), { limitInputPixels: MAX_PIXELS }).rotate();
		ext = sniff.ext as PhotoExt;
		storedMime = sniff.mime;
	}

	await ensureMediaDir();
	const storedName = newStoredName(ext);
	const thumbName = newStoredName('webp');

	let original: { data: Buffer; info: OutputInfo };
	let thumb: Buffer;
	let derived: Record<DerivedVariant, Buffer>;
	try {
		// Fully decode and re-encode all outputs in memory first: any failure
		// here is unambiguously a decode/encode problem with the source image,
		// never a filesystem error (F4).
		original = await encode(source.clone(), ext).toBuffer({ resolveWithObject: true });
		thumb = await source
			.clone()
			.resize({ width: THUMB_WIDTH, withoutEnlargement: true })
			.webp({ quality: 80 })
			.toBuffer();
		derived = await encodeDerived(source);
	} catch (err) {
		if (err instanceof Error && /pixel limit/i.test(err.message)) {
			throw new MediaError('Image trop grande.');
		}
		throw new MediaError('Image illisible.');
	}

	try {
		// Writes happen outside the decode/encode try block, via plain Node fs
		// calls, so a disk failure (e.g. ENOSPC, EC-12) always comes back as a
		// regular `NodeJS.ErrnoException` with `.code` set and is never mapped
		// to `MediaError('Image illisible.')`.
		await fs.writeFile(mediaPath(storedName), original.data);
		await fs.writeFile(mediaPath(thumbName), thumb);
		for (const variant of DERIVED_VARIANTS) {
			await fs.writeFile(mediaPath(derivedName(storedName, variant)), derived[variant]);
		}
	} catch (err) {
		await removeMediaFiles({ storedName, thumbName });
		throw err;
	}

	return {
		storedName,
		thumbName,
		mime: storedMime,
		width: original.info.width,
		height: original.info.height
	};
}

/**
 * Writes the derived variants missing on disk for an already-stored photo
 * (uploaded before they existed), from its stored original. Idempotent:
 * returns the variants actually written (empty when none was missing).
 * Each file is written under a temporary name then renamed, so an
 * interrupted run never leaves a truncated variant that looks complete.
 */
export async function generateMissingVariants(storedName: string): Promise<DerivedVariant[]> {
	const missing: DerivedVariant[] = [];
	for (const variant of DERIVED_VARIANTS) {
		try {
			await fs.access(mediaPath(derivedName(storedName, variant)));
		} catch {
			missing.push(variant);
		}
	}
	if (missing.length === 0) return [];

	const derived = await encodeDerived(
		sharp(mediaPath(storedName), { limitInputPixels: MAX_PIXELS }).rotate()
	);
	for (const variant of missing) {
		const target = mediaPath(derivedName(storedName, variant));
		await fs.writeFile(`${target}.tmp`, derived[variant]);
		await fs.rename(`${target}.tmp`, target);
	}
	return missing;
}

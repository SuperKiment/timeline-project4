import path from 'node:path';
import { fileTypeFromFile } from 'file-type';
import type { MediaKind } from '../db/schema';

/** Raised for any media rejection the caller should surface to the user (French message). */
export class MediaError extends Error {
	constructor(
		message: string,
		readonly status: 413 | 415 = 415
	) {
		super(message);
		this.name = 'MediaError';
	}
}

/** Maximum accepted upload size (500 MB), shared by upload/streaming code. */
export const MAX_BYTES = 500 * 1024 * 1024;

interface AllowedType {
	/** Real MIME types `file-type` may report for this extension (aliases included). */
	mimes: string[];
	kind: MediaKind;
}

/**
 * Extensions accepted from the client, mapped to the MIME type(s) their real
 * (sniffed) content must match and to their media kind. HEIC/HEIF are kept as
 * photos: they are converted to JPEG by `processPhoto` before storage.
 */
const ALLOWED: Record<string, AllowedType> = {
	jpg: { mimes: ['image/jpeg'], kind: 'photo' },
	jpeg: { mimes: ['image/jpeg'], kind: 'photo' },
	png: { mimes: ['image/png'], kind: 'photo' },
	webp: { mimes: ['image/webp'], kind: 'photo' },
	heic: { mimes: ['image/heic', 'image/heif'], kind: 'photo' },
	heif: { mimes: ['image/heic', 'image/heif'], kind: 'photo' },
	mp4: { mimes: ['video/mp4'], kind: 'video' },
	mov: { mimes: ['video/quicktime'], kind: 'video' },
	webm: { mimes: ['video/webm'], kind: 'video' }
};

export interface SniffResult {
	/** Real MIME type detected from file content. */
	mime: string;
	kind: MediaKind;
	/** Normalized extension (`jpeg` is folded into `jpg`). */
	ext: string;
}

/**
 * Validates a file already written to disk: the client-declared file name must
 * carry a supported extension, and the file's real content (sniffed via
 * `file-type`, never trusted from the name alone) must match that extension's
 * expected MIME type. Throws {@link MediaError} with a French message otherwise
 * (EC-9, NFR-4).
 */
export async function sniffAndValidate(filePath: string, clientName: string): Promise<SniffResult> {
	const rawExt = path.extname(clientName).slice(1).toLowerCase();
	const allowed = Object.hasOwn(ALLOWED, rawExt) ? ALLOWED[rawExt] : undefined;
	if (!allowed) {
		throw new MediaError('Type de fichier non supporté.');
	}

	const detected = await fileTypeFromFile(filePath);
	if (!detected || !allowed.mimes.includes(detected.mime)) {
		throw new MediaError('Le contenu du fichier ne correspond pas à son extension.');
	}

	return { mime: detected.mime, kind: allowed.kind, ext: rawExt === 'jpeg' ? 'jpg' : rawExt };
}

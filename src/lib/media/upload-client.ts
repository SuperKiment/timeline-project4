import type { MediaItem } from './types';

/** Owner form fields sent with each file (`ownerKind` + `ownerId`, or `seriesId` + `date`). */
export type OwnerFields = Record<string, string | number>;

export interface UploadProgress {
	/** Index of the file in the `files` array. */
	index: number;
	/** 0..1 */
	ratio: number;
}

export type UploadOutcome =
	{ file: File; ok: true; item: MediaItem } | { file: File; ok: false; message: string };

export const GENERIC_UPLOAD_ERROR = 'Échec du téléversement. Vérifiez votre connexion.';

/** Thrown when the server answers 401 (the browser is being redirected to the login page). */
export class AuthRequiredError extends Error {
	constructor() {
		super('Authentification requise.');
		this.name = 'AuthRequiredError';
	}
}

/**
 * Extracts the server's French `message` from a JSON error body, else `fallback`
 * (default: the generic upload error).
 */
export function extractErrorMessage(body: string, fallback: string = GENERIC_UPLOAD_ERROR): string {
	try {
		const parsed: unknown = JSON.parse(body);
		if (parsed && typeof parsed === 'object' && 'message' in parsed) {
			const message = (parsed as { message: unknown }).message;
			if (typeof message === 'string' && message.trim() !== '') return message;
		}
	} catch {
		// non-JSON body: fall through
	}
	return fallback;
}

/** Login URL that returns to the current page after authentication. */
export function loginRedirectUrl(pathname: string, search: string): string {
	return '/login?redirectTo=' + encodeURIComponent(pathname + search);
}

function uploadOne(
	file: File,
	ownerFields: OwnerFields,
	onProgress: (ratio: number) => void
): Promise<MediaItem[]> {
	return new Promise((resolve, reject) => {
		const form = new FormData();
		// Owner fields must precede the file: the server resolves them from text parts.
		for (const [key, value] of Object.entries(ownerFields)) form.append(key, String(value));
		form.append('file', file, file.name);

		const xhr = new XMLHttpRequest();
		xhr.open('POST', '/api/media');
		xhr.upload.onprogress = (event) => {
			if (event.lengthComputable && event.total > 0) onProgress(event.loaded / event.total);
		};
		xhr.onerror = () => reject(new Error(GENERIC_UPLOAD_ERROR));
		xhr.onabort = () => reject(new Error(GENERIC_UPLOAD_ERROR));
		xhr.onload = () => {
			if (xhr.status === 401) {
				location.href = loginRedirectUrl(location.pathname, location.search);
				reject(new AuthRequiredError());
				return;
			}
			if (xhr.status >= 200 && xhr.status < 300) {
				try {
					const items: unknown = JSON.parse(xhr.responseText);
					if (!Array.isArray(items)) throw new Error('bad shape');
					onProgress(1);
					resolve(items as MediaItem[]);
				} catch {
					reject(new Error(GENERIC_UPLOAD_ERROR));
				}
				return;
			}
			reject(new Error(extractErrorMessage(xhr.responseText)));
		};
		xhr.send(form);
	});
}

/**
 * Uploads files one request per file, sequentially. A failing file does NOT stop
 * the others: every file yields an outcome (success with item, or French error
 * message). The returned promise therefore always resolves with one outcome per
 * file, in order; callers inspect `ok`. A 401 redirects to the login page and
 * stops the remaining uploads.
 */
export async function uploadFiles(
	files: File[],
	ownerFields: OwnerFields,
	onProgress: (progress: UploadProgress) => void = () => {}
): Promise<UploadOutcome[]> {
	const outcomes: UploadOutcome[] = [];
	for (const [index, file] of files.entries()) {
		try {
			const items = await uploadOne(file, ownerFields, (ratio) => onProgress({ index, ratio }));
			// One file per request, so exactly one item is expected.
			outcomes.push({ file, ok: true, item: items[0] });
		} catch (err) {
			const message = err instanceof Error ? err.message : GENERIC_UPLOAD_ERROR;
			outcomes.push({ file, ok: false, message });
			if (err instanceof AuthRequiredError) break;
		}
	}
	return outcomes;
}

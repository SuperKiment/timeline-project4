import { error } from '@sveltejs/kit';

/**
 * Error carrying an HTTP status code. Services throw it for expected failure
 * cases (validation, authorization, not found); routes/hooks catch it and
 * turn it into the matching HTTP response.
 */
export class HttpError extends Error {
	constructor(
		public status: number,
		message: string
	) {
		super(message);
		this.name = 'HttpError';
	}
}

/**
 * Parses a route `[id]` param into a positive safe integer. Throws
 * `HttpError(400)` for anything else (missing, non-numeric, zero, unsafe).
 */
export function parseIdParam(raw: string | undefined): number {
	if (raw === undefined || !/^\d+$/.test(raw)) throw new HttpError(400, 'Identifiant invalide.');
	const id = Number(raw);
	if (!Number.isSafeInteger(id) || id < 1) throw new HttpError(400, 'Identifiant invalide.');
	return id;
}

/**
 * Page variant of `parseIdParam`: any invalid id is a SvelteKit 404 (pages
 * treat a malformed id like a missing entry) instead of a 400.
 */
export function parseIdParamOr404(raw: string | undefined): number {
	try {
		return parseIdParam(raw);
	} catch {
		error(404, 'Entrée introuvable.');
	}
}

/**
 * Turns a service `HttpError` into the matching SvelteKit HTTP error
 * (`{ message }` body); any other error is rethrown untouched.
 */
export function rethrowAsKitError(err: unknown): never {
	if (err instanceof HttpError) error(err.status, err.message);
	throw err;
}

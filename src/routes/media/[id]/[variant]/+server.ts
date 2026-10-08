import { getDb } from '$lib/server/db';
import { VARIANTS, serveMedia, type Variant } from '$lib/server/media/serve';
import type { RequestHandler } from './$types';

function isVariant(value: string): value is Variant {
	return (VARIANTS as readonly string[]).includes(value);
}

/**
 * Serves a media file (one of `VARIANTS`, e.g. `original`, `display`, `thumb`). Authentication is
 * enforced by the hooks guard (T9: unauthenticated `/media/*` -> 401); here
 * we only resolve visibility of the requested row (see `serveMedia`).
 */
export const GET: RequestHandler = async ({ params, request }) => {
	const id = Number(params.id);
	if (!Number.isInteger(id) || !isVariant(params.variant)) {
		return new Response(null, { status: 404 });
	}

	return serveMedia(getDb(), id, params.variant, request.headers.get('range'));
};

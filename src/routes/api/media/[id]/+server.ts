import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';
import { parseIdParam, rethrowAsKitError } from '$lib/server/http-error';
import { deleteMedia } from '$lib/server/media/upload';

/**
 * Soft-deletes a media file (FR-24). Auth is normally enforced by hooks, but
 * `locals.user` is also checked defensively here since it may not be
 * populated yet.
 */
export const DELETE: RequestHandler = ({ params, locals }) => {
	if (!locals.user) {
		error(401, 'Authentification requise.');
	}

	try {
		const id = parseIdParam(params.id);
		deleteMedia(getDb(), id, locals.user.id, Date.now());
	} catch (err) {
		rethrowAsKitError(err);
	}

	return json({ ok: true });
};

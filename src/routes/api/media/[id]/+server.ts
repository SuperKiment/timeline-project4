import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';
import { HttpError } from '$lib/server/http-error';
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

	const id = Number(params.id);
	if (!Number.isInteger(id)) {
		error(400, 'Identifiant invalide.');
	}

	try {
		deleteMedia(getDb(), id, locals.user.id, Date.now());
	} catch (err) {
		if (err instanceof HttpError) {
			error(err.status, err.message);
		}
		throw err;
	}

	return json({ ok: true });
};

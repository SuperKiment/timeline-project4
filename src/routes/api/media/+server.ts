import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';
import { handleUpload } from '$lib/server/media/upload';

/**
 * Uploads one or more media files (photo/video), attaching them to an entry,
 * a recurrent series occurrence, or the caller's own journal entry (FR-21).
 * Auth is normally enforced by hooks, but `locals.user` is also checked
 * defensively here since it may not be populated yet.
 */
export const POST: RequestHandler = ({ request, locals }) => {
	if (!locals.user) {
		error(401, 'Authentification requise.');
	}

	return handleUpload(getDb(), request, locals.user, Date.now());
};

import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';
import { invalidateSession } from '$lib/server/auth/session';

/** Clears the session (DB row + cookie) and sends the user back to `/login`. */
export const POST: RequestHandler = ({ cookies, locals }) => {
	const token = cookies.get('session');
	if (token) {
		invalidateSession(getDb(), token);
	}
	cookies.delete('session', { path: '/' });

	locals.user = null;
	locals.sessionId = null;

	redirect(303, '/login');
};

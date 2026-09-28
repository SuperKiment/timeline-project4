import type { Handle } from '@sveltejs/kit';
import { redirect } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import { validateSession } from '$lib/server/auth/session';
import { runStartup } from '$lib/server/startup';

/** The only path reachable while unauthenticated (Conventions, T9). */
const PUBLIC_PATHS = new Set(['/login', '/login/__data.json']);

/** Exact-match check (no prefix matching): `/loginx` and `/login/foo` stay protected. */
export function isPublicPath(pathname: string): boolean {
	return PUBLIC_PATHS.has(pathname);
}

function isApiOrMedia(pathname: string): boolean {
	return pathname.startsWith('/api/') || pathname.startsWith('/media/');
}

/**
 * Runs startup tasks (idempotent DB migrations), resolves the `session`
 * cookie into `locals.user`/`locals.sessionId`, and guards every route
 * except `/login`: unauthenticated `/api/*` and `/media/*` requests get a
 * bare 401 JSON response, unauthenticated page requests are redirected to
 * `/login?redirectTo=<path>`.
 */
export const handle: Handle = ({ event, resolve }) => {
	runStartup();

	const db = getDb();
	const token = event.cookies.get('session') ?? null;
	const user = token ? validateSession(db, token) : null;

	event.locals.user = user;
	event.locals.sessionId = user ? token : null;

	const { pathname } = event.url;

	if (!user && !isPublicPath(pathname)) {
		if (isApiOrMedia(pathname)) {
			return new Response(JSON.stringify({ message: 'Authentification requise.' }), {
				status: 401,
				headers: { 'content-type': 'application/json' }
			});
		}
		const redirectTo = encodeURIComponent(pathname + event.url.search);
		redirect(303, `/login?redirectTo=${redirectTo}`);
	}

	return resolve(event);
};

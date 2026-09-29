import type { PageServerLoad } from './$types';
import { requireUser } from '$lib/server/auth/session';

/**
 * Auth is normally enforced by hooks; `locals.user` is checked defensively
 * here too and falls back to redirecting to the login page.
 */
export const load: PageServerLoad = ({ locals }) => {
	return { user: requireUser(locals) };
};

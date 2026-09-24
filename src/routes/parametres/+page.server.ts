import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

/**
 * Auth is normally enforced by hooks; `locals.user` is checked defensively
 * here too and falls back to redirecting to the login page.
 */
export const load: PageServerLoad = ({ locals }) => {
	if (!locals.user) {
		redirect(303, '/login');
	}

	return { user: locals.user };
};

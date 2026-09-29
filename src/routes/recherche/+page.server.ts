import { requireUser } from '$lib/server/auth/session';
import { getDb } from '$lib/server/db';
import { search } from '$lib/server/search/service';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, url }) => {
	requireUser(locals);

	const q = (url.searchParams.get('q') ?? '').trim();
	return { q, results: q === '' ? null : search(getDb(), q) };
};

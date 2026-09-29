import { redirect } from '@sveltejs/kit';
import { getDb } from '$lib/server/db';
import { search } from '$lib/server/search/service';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, url }) => {
	if (!locals.user) {
		redirect(303, '/login');
	}

	const q = (url.searchParams.get('q') ?? '').trim();
	return { q, results: q === '' ? null : search(getDb(), q) };
};

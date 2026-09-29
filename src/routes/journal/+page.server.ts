import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getConfig } from '$lib/server/config';
import { todayIn } from '$lib/server/time';

export const load: PageServerLoad = ({ locals }) => {
	if (!locals.user) {
		redirect(303, '/login');
	}
	redirect(303, `/journal/${todayIn(getConfig().tz)}`);
};

import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { requireUser } from '$lib/server/auth/session';
import { getConfig } from '$lib/server/config';
import { todayIn } from '$lib/server/time';

export const load: PageServerLoad = ({ locals }) => {
	requireUser(locals);
	redirect(303, `/journal/${todayIn(getConfig().tz)}`);
};

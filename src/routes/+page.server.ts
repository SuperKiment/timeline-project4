import type { PageServerLoad } from './$types';
import { requireUser } from '$lib/server/auth/session';
import { getConfig } from '$lib/server/config';
import { getDb } from '$lib/server/db';
import { getTimeline, hasUserContent } from '$lib/server/timeline/query';
import { todayIn } from '$lib/server/time';
import { parseTypesParam, parseView, VIEW_COOKIE } from '$lib/timeline/prefs';

export const load: PageServerLoad = ({ cookies, locals, url }) => {
	requireUser(locals);

	const types = parseTypesParam(url.searchParams.get('types'));
	const today = todayIn(getConfig().tz);
	const db = getDb();

	return {
		today,
		types,
		// `null` until the browser has picked one (see +page.svelte).
		view: parseView(cookies.get(VIEW_COOKIE)),
		items: getTimeline(db, { types, today }),
		// EC-14: seeded histoire items alone don't count as content.
		isEmpty: !hasUserContent(db)
	};
};

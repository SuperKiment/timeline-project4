import type { PageServerLoad } from './$types';
import { requireUser } from '$lib/server/auth/session';
import { getConfig } from '$lib/server/config';
import { getDb } from '$lib/server/db';
import { getTimeline, hasUserContent } from '$lib/server/timeline/query';
import { todayIn } from '$lib/server/time';
import { parseTypesParam } from '$lib/timeline/prefs';

export const load: PageServerLoad = ({ locals, url }) => {
	requireUser(locals);

	const types = parseTypesParam(url.searchParams.get('types'));
	const today = todayIn(getConfig().tz);
	const db = getDb();

	return {
		today,
		types,
		items: getTimeline(db, { types, today }),
		// EC-14: seeded histoire items alone don't count as content.
		isEmpty: !hasUserContent(db)
	};
};

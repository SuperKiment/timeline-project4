import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getDb } from '$lib/server/db';
import { exportAll } from '$lib/server/export';
import { todayIn } from '$lib/server/time';
import { getConfig } from '$lib/server/config';

/**
 * Full JSON data export, downloadable from the Settings page (FR-27). Auth
 * is normally enforced by hooks, but is also checked here defensively since
 * `locals.user` may not be populated yet.
 */
export const GET: RequestHandler = ({ locals }) => {
	if (!locals.user) {
		error(401, 'Authentification requise.');
	}

	const db = getDb();
	const data = exportAll(db);
	const filename = `timeline-export-${todayIn(getConfig().tz)}.json`;

	return json(data, {
		headers: {
			'Content-Disposition': `attachment; filename="${filename}"`
		}
	});
};

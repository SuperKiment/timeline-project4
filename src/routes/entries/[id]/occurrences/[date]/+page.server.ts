import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getConfig } from '$lib/server/config';
import { getDb, type Db } from '$lib/server/db';
import { getOccurrence, upsertOccurrenceNote } from '$lib/server/entries/occurrences';
import { HttpError, parseIdParamOr404 } from '$lib/server/http-error';
import { listMediaByOwner } from '$lib/server/media/query';
import { todayIn } from '$lib/server/time';

/** Page variant: unknown series, malformed or non-occurrence date are all a 404. */
function getOccurrenceOr404(db: Db, seriesId: number, date: string, today: string) {
	try {
		return getOccurrence(db, seriesId, date, today);
	} catch (err) {
		if (err instanceof HttpError) error(404, 'Occurrence introuvable.');
		throw err;
	}
}

export const load: PageServerLoad = ({ locals, params }) => {
	if (!locals.user) {
		redirect(303, '/login');
	}

	const db = getDb();
	const seriesId = parseIdParamOr404(params.id);

	const detail = getOccurrenceOr404(db, seriesId, params.date, todayIn(getConfig().tz));

	return {
		seriesId,
		title: detail.seriesTitle,
		date: params.date,
		note: detail.note ?? '',
		media:
			detail.noteId === null
				? []
				: (listMediaByOwner(db, 'occurrence', [detail.noteId]).get(detail.noteId) ?? [])
	};
};

export const actions: Actions = {
	save: async ({ request, locals, params }) => {
		if (!locals.user) {
			redirect(303, '/login');
		}

		const seriesId = parseIdParamOr404(params.id);
		const tz = getConfig().tz;
		const db = getDb();
		getOccurrenceOr404(db, seriesId, params.date, todayIn(tz));
		const raw = (await request.formData()).get('note');
		if (typeof raw !== 'string') {
			return fail(400, { message: 'Note invalide.', note: '' });
		}
		const text = raw.trim();

		try {
			upsertOccurrenceNote(
				db,
				seriesId,
				params.date,
				text === '' ? null : text,
				locals.user.id,
				Date.now(),
				todayIn(tz)
			);
			return { saved: true };
		} catch (err) {
			if (err instanceof HttpError) return fail(err.status, { message: err.message, note: raw });
			throw err;
		}
	}
};

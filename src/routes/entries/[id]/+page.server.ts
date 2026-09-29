import { error, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { fromSortKey, formatPeriodFr } from '$lib/dates/fuzzy';
import { getConfig } from '$lib/server/config';
import { getDb } from '$lib/server/db';
import { getEntry, listJournalDaysForEntry, softDeleteEntry } from '$lib/server/entries/service';
import { getEntryMeta } from '$lib/server/entries/meta';
import { listSeriesOccurrences } from '$lib/server/entries/occurrences';
import { parseIdParamOr404 } from '$lib/server/http-error';
import { renderMarkdown } from '$lib/server/markdown';
import { listMediaByOwner } from '$lib/server/media/query';
import { isOngoing } from '$lib/server/timeline/query';
import { todayIn } from '$lib/server/time';
import { parseTagsJson } from '$lib/timeline/entry-form';
import type { EntryType } from '$lib/timeline/types';

export const load: PageServerLoad = ({ locals, params }) => {
	if (!locals.user) {
		redirect(303, '/login');
	}

	const db = getDb();
	const entry = getEntry(db, parseIdParamOr404(params.id));
	if (!entry) error(404, 'Entrée introuvable.');

	const tz = getConfig().tz;
	const today = todayIn(tz);
	const series =
		entry.type === 'recurrent' && entry.recurrenceFreq
			? listSeriesOccurrences(db, entry.id, today)
			: null;
	const ongoing = isOngoing(entry.type as EntryType, entry.endSort);

	return {
		id: entry.id,
		type: entry.type as EntryType,
		title: entry.title,
		period: formatPeriodFr(
			fromSortKey(entry.startSort),
			entry.endSort ? fromSortKey(entry.endSort) : null,
			ongoing
		),
		location: entry.location,
		tags: parseTagsJson(entry.tags),
		descriptionHtml: entry.description ? renderMarkdown(entry.description) : '',
		media: listMediaByOwner(db, 'entry', [entry.id]).get(entry.id) ?? [],
		journalDays: listJournalDaysForEntry(db, entry, today),
		series,
		meta: getEntryMeta(db, entry, tz)
	};
};

export const actions: Actions = {
	delete: ({ locals, params }) => {
		if (!locals.user) {
			redirect(303, '/login');
		}

		const id = parseIdParamOr404(params.id);
		const db = getDb();
		if (!getEntry(db, id)) error(404, 'Entrée introuvable.');
		softDeleteEntry(db, id, Date.now());
		redirect(303, '/');
	}
};

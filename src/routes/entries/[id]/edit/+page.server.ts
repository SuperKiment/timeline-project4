import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getConfig } from '$lib/server/config';
import { getDb } from '$lib/server/db';
import { getEntry, updateEntry } from '$lib/server/entries/service';
import { getEntryMeta } from '$lib/server/entries/meta';
import { parseIdParamOr404 } from '$lib/server/http-error';
import { validateEntryInput } from '$lib/server/entries/validate';
import { entryFormValuesFromFormData, entryToFormValues } from '$lib/timeline/entry-form';

export const load: PageServerLoad = ({ locals, params }) => {
	if (!locals.user) {
		redirect(303, '/login');
	}

	const db = getDb();
	const entry = getEntry(db, parseIdParamOr404(params.id));
	if (!entry) error(404, 'Entrée introuvable.');

	const tz = getConfig().tz;
	return {
		entryId: entry.id,
		values: entryToFormValues(entry),
		meta: getEntryMeta(db, entry, tz)
	};
};

export const actions: Actions = {
	default: async ({ request, locals, params }) => {
		if (!locals.user) {
			redirect(303, '/login');
		}

		const id = parseIdParamOr404(params.id);
		const values = entryFormValuesFromFormData(await request.formData());
		const result = validateEntryInput(values);
		if (!result.ok) {
			return fail(400, { errors: result.errors, values });
		}

		const entry = updateEntry(getDb(), id, result.value, locals.user.id, Date.now());
		if (!entry) error(404, 'Entrée introuvable.');
		redirect(303, `/entries/${entry.id}`);
	}
};

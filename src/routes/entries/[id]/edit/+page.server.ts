import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getDisplayNames } from '$lib/server/auth/users';
import { getConfig } from '$lib/server/config';
import { getDb } from '$lib/server/db';
import { getEntry, updateEntry } from '$lib/server/entries/service';
import { parseIdParam } from '$lib/server/http-error';
import { validateEntryInput } from '$lib/server/entries/validate';
import { formatStamp } from '$lib/dates/format';
import { entryFormValuesFromFormData, entryToFormValues } from '$lib/timeline/entry-form';

/** Parses the `[id]` param to a positive integer; any invalid id is a 404 for pages. */
function parseId(raw: string): number {
	try {
		return parseIdParam(raw);
	} catch {
		error(404, 'Entrée introuvable.');
	}
}

export const load: PageServerLoad = ({ locals, params }) => {
	if (!locals.user) {
		redirect(303, '/login');
	}

	const db = getDb();
	const entry = getEntry(db, parseId(params.id));
	if (!entry) error(404, 'Entrée introuvable.');

	const userIds = [entry.createdBy, entry.updatedBy].filter((id): id is number => id !== null);
	const names = getDisplayNames(db, userIds);
	const nameOf = (id: number | null) =>
		id !== null && names.has(id) ? names.get(id)! : 'un ancien utilisateur';

	const tz = getConfig().tz;
	return {
		entryId: entry.id,
		values: entryToFormValues(entry),
		meta: {
			createdBy: nameOf(entry.createdBy),
			createdAt: formatStamp(entry.createdAt, tz),
			updatedBy: nameOf(entry.updatedBy),
			updatedAt: formatStamp(entry.updatedAt, tz)
		}
	};
};

export const actions: Actions = {
	default: async ({ request, locals, params }) => {
		if (!locals.user) {
			redirect(303, '/login');
		}

		const id = parseId(params.id);
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

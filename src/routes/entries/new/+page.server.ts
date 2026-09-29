import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getConfig } from '$lib/server/config';
import { getDb } from '$lib/server/db';
import { createEntry } from '$lib/server/entries/service';
import { validateEntryInput } from '$lib/server/entries/validate';
import { todayIn } from '$lib/server/time';
import { entryFormValuesFromFormData, prefillEntryFormValues } from '$lib/timeline/entry-form';

export const load: PageServerLoad = ({ locals, url }) => {
	if (!locals.user) {
		redirect(303, '/login');
	}

	return { values: prefillEntryFormValues(url.searchParams, todayIn(getConfig().tz)) };
};

export const actions: Actions = {
	default: async ({ request, locals }) => {
		if (!locals.user) {
			redirect(303, '/login');
		}

		const values = entryFormValuesFromFormData(await request.formData());
		const result = validateEntryInput(values);
		if (!result.ok) {
			return fail(400, { errors: result.errors, values });
		}

		const entry = createEntry(getDb(), result.value, locals.user.id, Date.now());
		redirect(303, `/entries/${entry.id}`);
	}
};

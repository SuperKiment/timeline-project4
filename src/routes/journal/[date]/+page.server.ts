import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getConfig } from '$lib/server/config';
import { getDb } from '$lib/server/db';
import { addDays } from '$lib/dates/fuzzy';
import { HttpError, rethrowAsKitError } from '$lib/server/http-error';
import { getDay, softDeleteOwnDay, upsertOwnEntry } from '$lib/server/journal/service';
import { listMediaByOwner } from '$lib/server/media/query';
import { renderMarkdown } from '$lib/server/markdown';
import { todayIn } from '$lib/server/time';

/** Loads the day, turning an invalid-day HttpError from the service into a SvelteKit error. */
function loadDay(day: string) {
	try {
		return getDay(getDb(), day, getConfig().tz);
	} catch (err) {
		rethrowAsKitError(err);
	}
}

export const load: PageServerLoad = ({ locals, params }) => {
	if (!locals.user) {
		redirect(303, '/login');
	}
	const userId = locals.user.id;
	const day = loadDay(params.date);
	const today = todayIn(getConfig().tz);

	const own = day.entries.find((e) => e.userId === userId) ?? null;
	const partner = day.entries.find((e) => e.userId !== userId) ?? null;

	const journalIds = [own?.id, partner?.id].filter((id): id is number => id !== undefined);
	const mediaByEntry = listMediaByOwner(getDb(), 'journal', journalIds);

	return {
		day: day.day,
		today,
		isFuture: day.isFuture,
		userId,
		prevDay: addDays(day.day, -1),
		nextDay: day.day < today ? addDays(day.day, 1) : null,
		own: own && {
			id: own.id,
			text: own.text,
			mood: own.mood,
			updatedAt: own.updatedAt,
			media: mediaByEntry.get(own.id) ?? []
		},
		partner: partner && {
			id: partner.id,
			authorName: partner.authorName,
			html: renderMarkdown(partner.text),
			mood: partner.mood,
			media: mediaByEntry.get(partner.id) ?? []
		}
	};
};

export const actions: Actions = {
	save: async ({ request, locals, params }) => {
		if (!locals.user) {
			redirect(303, '/login');
		}
		const data = await request.formData();
		const text = data.get('text');
		const rawMood = data.get('mood');
		if (typeof text !== 'string') {
			return fail(400, { message: 'Texte invalide.', text: '' });
		}
		const mood = typeof rawMood === 'string' && rawMood !== '' ? rawMood : null;

		try {
			const id = upsertOwnEntry(
				getDb(),
				locals.user.id,
				params.date,
				{ text, mood },
				getConfig().tz
			);
			return { saved: true, id };
		} catch (err) {
			if (err instanceof HttpError) {
				return fail(err.status, { message: err.message, text, mood });
			}
			throw err;
		}
	},

	delete: ({ locals, params }) => {
		if (!locals.user) {
			redirect(303, '/login');
		}
		const userId = locals.user.id;
		const db = getDb();
		try {
			softDeleteOwnDay(db, userId, params.date, getConfig().tz);
			return { deleted: true };
		} catch (err) {
			if (err instanceof HttpError) return fail(err.status, { message: err.message });
			throw err;
		}
	}
};

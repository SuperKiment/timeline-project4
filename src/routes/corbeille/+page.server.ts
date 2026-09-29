import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { formatStamp } from '$lib/dates/format';
import { getConfig } from '$lib/server/config';
import { getDb } from '$lib/server/db';
import { HttpError, parseIdParam } from '$lib/server/http-error';
import { listTrash, purgeItem, restore, type TrashKind } from '$lib/server/trash/service';

const KIND_LABELS: Record<TrashKind, string> = {
	entry: 'Entrée',
	occurrenceNote: 'Note d’occurrence',
	journal: 'Journal',
	media: 'Média'
};

export const load: PageServerLoad = ({ locals }) => {
	if (!locals.user) {
		redirect(303, '/login');
	}

	const userId = locals.user.id;
	const tz = getConfig().tz;

	return {
		items: listTrash(getDb()).map((item) => ({
			kind: item.kind,
			id: item.id,
			typeLabel: KIND_LABELS[item.kind],
			title: item.title,
			deletedAt: formatStamp(item.deletedAt, tz),
			expiresAt: formatStamp(item.expiresAt, tz),
			// Someone else's journal content (or its media) is listed but read-only.
			actionable: item.ownerId === null || item.ownerId === userId
		}))
	};
};

/** Reads the hidden `kind` / `id` inputs; a bad id becomes a 400 `fail`. */
function readTarget(data: FormData): { kind: string; id: number } | null {
	const kind = data.get('kind');
	const rawId = data.get('id');
	if (typeof kind !== 'string' || typeof rawId !== 'string') return null;
	try {
		return { kind, id: parseIdParam(rawId) };
	} catch (err) {
		if (err instanceof HttpError) return null;
		throw err;
	}
}

export const actions: Actions = {
	restore: async ({ locals, request }) => {
		if (!locals.user) {
			redirect(303, '/login');
		}

		const target = readTarget(await request.formData());
		if (!target) return fail(400, { message: 'Élément invalide.' });
		try {
			restore(getDb(), target.kind, target.id, locals.user.id);
		} catch (err) {
			if (err instanceof HttpError) return fail(err.status, { message: err.message });
			throw err;
		}
		return { success: true };
	},

	purge: async ({ locals, request }) => {
		if (!locals.user) {
			redirect(303, '/login');
		}

		const target = readTarget(await request.formData());
		if (!target) return fail(400, { message: 'Élément invalide.' });
		try {
			await purgeItem(getDb(), target.kind, target.id, locals.user.id);
		} catch (err) {
			if (err instanceof HttpError) return fail(err.status, { message: err.message });
			throw err;
		}
		return { success: true };
	}
};

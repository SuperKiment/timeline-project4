import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getConfig } from '$lib/server/config';
import { getDb } from '$lib/server/db';
import { parseIdParam, rethrowAsKitError } from '$lib/server/http-error';
import {
	softDeleteJournal,
	softDeleteOwnDay,
	updateEntryById,
	upsertOwnEntry
} from '$lib/server/journal/service';

/** Parses the optional `?id=` (target entry id) query param; 400 when malformed. */
function parseTargetId(url: URL): number | null {
	const raw = url.searchParams.get('id');
	return raw === null ? null : parseIdParam(raw);
}

/**
 * PUT `{ text, mood }` → upserts the caller's own entry for `[date]`.
 * With `?id=<entryId>` the entry is updated by id instead (403 if not the author's).
 */
export const PUT: RequestHandler = async ({ params, url, request, locals }) => {
	if (!locals.user) error(401, 'Authentification requise.');
	const userId = locals.user.id;

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		error(400, 'Corps de requête invalide.');
	}
	const { text, mood } = (body ?? {}) as Record<string, unknown>;
	if (typeof text !== 'string' || (mood != null && typeof mood !== 'string')) {
		error(400, 'Texte ou humeur invalide.');
	}

	const db = getDb();
	const now = Date.now();
	const input = { text, mood: mood ?? null };
	try {
		const targetId = parseTargetId(url);
		if (targetId !== null) {
			updateEntryById(db, targetId, userId, input, now);
			return json({ id: targetId });
		}
		return json({ id: upsertOwnEntry(db, userId, params.date, input, getConfig().tz, now) });
	} catch (err) {
		rethrowAsKitError(err);
	}
};

/**
 * DELETE → soft-deletes the caller's own entry for `[date]`, or the one given
 * by `?id=` (403 if not the author's).
 */
export const DELETE: RequestHandler = ({ params, url, locals }) => {
	if (!locals.user) error(401, 'Authentification requise.');
	const userId = locals.user.id;

	const db = getDb();
	try {
		const targetId = parseTargetId(url);
		if (targetId !== null) {
			softDeleteJournal(db, targetId, userId, Date.now());
		} else {
			softDeleteOwnDay(db, userId, params.date, Date.now());
		}
		return json({ ok: true });
	} catch (err) {
		rethrowAsKitError(err);
	}
};

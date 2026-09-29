import { isValidFuzzy, parseIsoDay } from '../dates/fuzzy';
import { HttpError } from './http-error';

/** Max length, in characters, of a journal text or an occurrence note. */
export const MAX_TEXT_LENGTH = 50_000;

const ISO_DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Validates `day` as a real calendar date `YYYY-MM-DD`. Throws 400 otherwise. */
export function assertValidDay(day: string): void {
	if (!ISO_DAY_RE.test(day) || !isValidFuzzy({ ...parseIsoDay(day), precision: 'day' })) {
		throw new HttpError(400, 'Date invalide.');
	}
}

/** Returns the ISO day (`YYYY-MM-DD`) for `now` in the given IANA timezone. */
export function todayIn(tz: string, now = new Date()): string {
	return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(now);
}

/** Whether `isoDay` is strictly after today in the given timezone. */
export function isFutureDay(isoDay: string, tz: string, now = new Date()): boolean {
	return isoDay > todayIn(tz, now);
}

/** Extracts the `MM-DD` part of an ISO day (`YYYY-MM-DD`). */
export function monthDay(isoDay: string): string {
	return isoDay.slice(5, 10);
}

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

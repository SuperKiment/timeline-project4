/** "Il y a 1 an" / "Il y a N ans". */
export function yearsAgoLabel(years: number): string {
	return `Il y a ${years} ${years === 1 ? 'an' : 'ans'}`;
}

/** "3 mai 2026 à 14:30" in the given IANA timezone. */
export function formatStamp(ms: number, tz: string): string {
	return new Intl.DateTimeFormat('fr-FR', {
		timeZone: tz,
		dateStyle: 'long',
		timeStyle: 'short'
	}).format(new Date(ms));
}

/** French label for an ISO day ("YYYY-MM-DD"), e.g. "3 mai 2026" (long) or "dimanche 3 mai 2026" (full). */
export function formatDayFr(day: string, dateStyle: 'long' | 'full' = 'long'): string {
	return new Intl.DateTimeFormat('fr-FR', { dateStyle, timeZone: 'UTC' }).format(
		new Date(`${day}T00:00:00Z`)
	);
}

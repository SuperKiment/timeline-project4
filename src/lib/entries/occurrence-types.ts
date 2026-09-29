export interface SeriesOccurrence {
	date: string;
	note: string | null;
	noteId: number | null;
	mediaCount: number;
}

export interface OrphanOccurrenceNote {
	id: number;
	date: string;
	note: string | null;
	mediaCount: number;
}

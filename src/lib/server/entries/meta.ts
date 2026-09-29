import { formatStamp } from '../../dates/format';
import { getDisplayNames } from '../auth/users';
import type { Db } from '../db';
import type { EntryRow } from './service';

export interface EntryMeta {
	createdBy: string;
	createdAt: string;
	updatedBy: string;
	updatedAt: string;
}

const UNKNOWN_USER = 'un ancien utilisateur';

/**
 * Authorship block shown on entry pages: who created/last updated the entry
 * and when. A missing or deleted user (null id, unknown id) reads as
 * "un ancien utilisateur".
 */
export function getEntryMeta(
	db: Db,
	entry: Pick<EntryRow, 'createdBy' | 'updatedBy' | 'createdAt' | 'updatedAt'>,
	tz: string
): EntryMeta {
	const userIds = [entry.createdBy, entry.updatedBy].filter((id): id is number => id !== null);
	const names = getDisplayNames(db, userIds);
	const nameOf = (id: number | null) =>
		id !== null ? (names.get(id) ?? UNKNOWN_USER) : UNKNOWN_USER;

	return {
		createdBy: nameOf(entry.createdBy),
		createdAt: formatStamp(entry.createdAt, tz),
		updatedBy: nameOf(entry.updatedBy),
		updatedAt: formatStamp(entry.updatedAt, tz)
	};
}

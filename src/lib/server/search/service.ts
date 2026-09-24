import { sql } from 'drizzle-orm';
import type { Db } from '../db';

/**
 * Full-text search over entries (title/description/location/tags) and
 * journal entries (text). Backed by the `entries_fts`/`journal_fts` FTS5
 * external-content tables (see drizzle/0001_fts5.sql).
 *
 * IMPORTANT: external-content FTS5 tables keep rows for soft-deleted
 * entries/journal entries (they are only removed from the index on a real
 * SQL DELETE, not on an UPDATE that merely sets `deleted_at`). Every query
 * here therefore joins back to the base table and filters `deleted_at is
 * null` so soft-deleted content never surfaces in results.
 */

export type SearchResult =
	| { kind: 'entry'; id: number; title: string; snippet: string; url: string }
	| { kind: 'journal'; day: string; author: string; snippet: string; url: string };

const SNIPPET_ELLIPSIS = '…';
const SNIPPET_TOKENS = 10;

/**
 * Turns free-text user input into an FTS5 MATCH query string: whitespace
 * splits it into tokens, `"` and FTS5 syntax characters are stripped from
 * each token (so user input can never inject FTS operators or break the
 * query), and each remaining token becomes a quoted prefix match (`"tok"*`).
 * Tokens joined with a space are an implicit AND. Returns null when there is
 * nothing left to search for (callers should short-circuit to no results).
 */
export function toFtsQuery(input: string): string | null {
	const tokens = input
		.split(/\s+/)
		.map((token) => token.replace(/["*^:()+~-]/g, ''))
		.filter((token) => token.length > 0);

	if (tokens.length === 0) return null;

	return tokens.map((token) => `"${token}"*`).join(' ');
}

interface EntryHit {
	id: number;
	title: string;
	snippet: string;
}

interface JournalHit {
	day: string;
	author: string;
	snippet: string;
}

/**
 * Searches visible (non-deleted) entries and journal entries for `q`, capped
 * at `limit`. Journal is shared per FR-16: both users' entries are
 * searchable by both users. Returns [] for empty/garbage-only input, never
 * throws on malformed FTS syntax since `toFtsQuery` neutralizes it.
 *
 * bm25 scores from `entries_fts` (4 columns) and `journal_fts` (1 column)
 * are not comparable across tables, so we never sort a merged list by raw
 * bm25. Instead each query is ranked independently by bm25 (best first),
 * and the two ranked lists are interleaved by position: entry#1, journal#1,
 * entry#2, journal#2, … On a tie in interleave position the entry hit comes
 * first. Once one list is exhausted, the remainder of the other list is
 * appended in its own rank order.
 */
export function search(db: Db, q: string, limit = 50): SearchResult[] {
	const ftsQuery = toFtsQuery(q);
	if (!ftsQuery) return [];

	const entryHits = db.all<EntryHit>(sql`
		select e.id as id, e.title as title,
			snippet(entries_fts, -1, '', '', ${SNIPPET_ELLIPSIS}, ${SNIPPET_TOKENS}) as snippet
		from entries_fts
		join entries e on e.id = entries_fts.rowid
		where entries_fts match ${ftsQuery} and e.deleted_at is null
		order by bm25(entries_fts)
		limit ${limit}
	`);

	const journalHits = db.all<JournalHit>(sql`
		select j.day as day, u.display_name as author,
			snippet(journal_fts, -1, '', '', ${SNIPPET_ELLIPSIS}, ${SNIPPET_TOKENS}) as snippet
		from journal_fts
		join journal_entries j on j.id = journal_fts.rowid
		join users u on u.id = j.user_id
		where journal_fts match ${ftsQuery} and j.deleted_at is null
		order by bm25(journal_fts)
		limit ${limit}
	`);

	const entryResults: SearchResult[] = entryHits.map((hit) => ({
		kind: 'entry' as const,
		id: hit.id,
		title: hit.title,
		snippet: hit.snippet,
		url: `/entries/${hit.id}`
	}));

	const journalResults: SearchResult[] = journalHits.map((hit) => ({
		kind: 'journal' as const,
		day: hit.day,
		author: hit.author,
		snippet: hit.snippet,
		url: `/journal/${hit.day}`
	}));

	const interleaved: SearchResult[] = [];
	const maxLen = Math.max(entryResults.length, journalResults.length);
	for (let i = 0; i < maxLen; i++) {
		if (i < entryResults.length) interleaved.push(entryResults[i]);
		if (i < journalResults.length) interleaved.push(journalResults[i]);
	}

	return interleaved.slice(0, limit);
}

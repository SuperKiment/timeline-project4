-- FTS5 external-content search indexes over `entries` and `journal_entries`,
-- kept in sync via triggers. drizzle-kit cannot generate virtual tables, so
-- this migration is hand-written (see T3 plan). Each statement must stand
-- alone (better-sqlite3 prepares one statement at a time), separated by a
-- breakpoint marker (see other migration files in this folder).
CREATE VIRTUAL TABLE entries_fts USING fts5(
	title,
	description,
	location,
	tags,
	content='entries',
	content_rowid='id'
);
--> statement-breakpoint
INSERT INTO entries_fts(rowid, title, description, location, tags)
SELECT id, title, description, location, tags FROM entries;
--> statement-breakpoint
CREATE TRIGGER entries_fts_ai AFTER INSERT ON entries BEGIN
	INSERT INTO entries_fts(rowid, title, description, location, tags)
	VALUES (new.id, new.title, new.description, new.location, new.tags);
END;
--> statement-breakpoint
CREATE TRIGGER entries_fts_ad AFTER DELETE ON entries BEGIN
	INSERT INTO entries_fts(entries_fts, rowid, title, description, location, tags)
	VALUES ('delete', old.id, old.title, old.description, old.location, old.tags);
END;
--> statement-breakpoint
CREATE TRIGGER entries_fts_au AFTER UPDATE ON entries BEGIN
	INSERT INTO entries_fts(entries_fts, rowid, title, description, location, tags)
	VALUES ('delete', old.id, old.title, old.description, old.location, old.tags);
	INSERT INTO entries_fts(rowid, title, description, location, tags)
	VALUES (new.id, new.title, new.description, new.location, new.tags);
END;
--> statement-breakpoint
CREATE VIRTUAL TABLE journal_fts USING fts5(
	text,
	content='journal_entries',
	content_rowid='id'
);
--> statement-breakpoint
INSERT INTO journal_fts(rowid, text)
SELECT id, text FROM journal_entries;
--> statement-breakpoint
CREATE TRIGGER journal_fts_ai AFTER INSERT ON journal_entries BEGIN
	INSERT INTO journal_fts(rowid, text) VALUES (new.id, new.text);
END;
--> statement-breakpoint
CREATE TRIGGER journal_fts_ad AFTER DELETE ON journal_entries BEGIN
	INSERT INTO journal_fts(journal_fts, rowid, text) VALUES ('delete', old.id, old.text);
END;
--> statement-breakpoint
CREATE TRIGGER journal_fts_au AFTER UPDATE ON journal_entries BEGIN
	INSERT INTO journal_fts(journal_fts, rowid, text) VALUES ('delete', old.id, old.text);
	INSERT INTO journal_fts(rowid, text) VALUES (new.id, new.text);
END;

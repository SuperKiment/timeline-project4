import { sql, type AnyColumn } from 'drizzle-orm';
import { check, index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { PRECISIONS } from '../../dates/fuzzy';
import { ENTRY_TYPES } from '../../timeline/types';

/**
 * Drizzle schema for the whole app. IDs are integer autoincrement, days are
 * ISO strings `YYYY-MM-DD`, timestamps are integer ms epoch (see plan
 * Conventions). The FTS5 virtual tables (`entries_fts`, `journal_fts`) and
 * their sync triggers are NOT declared here (drizzle-kit cannot generate
 * virtual tables); they live in a hand-written custom migration instead.
 */

/**
 * `col in ('a','b')` built from a compile-time constant tuple, so CHECK
 * constraints cannot drift from the TS enums (values are never user input).
 */
const inList = (column: AnyColumn, values: readonly string[]) =>
	sql`${column} in (${sql.raw(values.map((v) => `'${v}'`).join(','))})`;

export const users = sqliteTable('users', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	username: text('username').notNull().unique(),
	displayName: text('display_name').notNull(),
	passwordHash: text('password_hash').notNull(),
	createdAt: integer('created_at').notNull()
});

export const sessions = sqliteTable('sessions', {
	id: text('id').primaryKey(),
	userId: integer('user_id')
		.notNull()
		.references(() => users.id, { onDelete: 'cascade' }),
	expiresAt: integer('expires_at').notNull()
});

export const RECURRENCE_FREQS = ['yearly', 'monthly'] as const;
export type RecurrenceFreq = (typeof RECURRENCE_FREQS)[number];

export const entries = sqliteTable(
	'entries',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		type: text('type', { enum: ENTRY_TYPES }).notNull(),
		title: text('title').notNull(),
		description: text('description'),
		location: text('location'),
		// JSON array, e.g. '["a","b"]'
		tags: text('tags').notNull().default('[]'),
		startSort: text('start_sort').notNull(),
		startPrecision: text('start_precision', { enum: PRECISIONS }).notNull(),
		endSort: text('end_sort'),
		endPrecision: text('end_precision', { enum: PRECISIONS }),
		recurrenceFreq: text('recurrence_freq', { enum: RECURRENCE_FREQS }),
		seedKey: text('seed_key').unique(),
		createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }),
		createdAt: integer('created_at').notNull(),
		updatedBy: integer('updated_by').references(() => users.id, { onDelete: 'set null' }),
		updatedAt: integer('updated_at').notNull(),
		deletedAt: integer('deleted_at')
	},
	(table) => [
		index('entries_start_sort_idx').on(table.startSort),
		index('entries_type_idx').on(table.type),
		check('entries_type_check', inList(table.type, ENTRY_TYPES)),
		check('entries_start_precision_check', inList(table.startPrecision, PRECISIONS)),
		check(
			'entries_end_precision_check',
			sql`${table.endPrecision} is null or ${inList(table.endPrecision, PRECISIONS)}`
		),
		check(
			'entries_recurrence_freq_check',
			sql`${table.recurrenceFreq} is null or ${inList(table.recurrenceFreq, RECURRENCE_FREQS)}`
		)
	]
);

export const occurrenceNotes = sqliteTable(
	'occurrence_notes',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		seriesId: integer('series_id')
			.notNull()
			.references(() => entries.id, { onDelete: 'cascade' }),
		occurrenceDate: text('occurrence_date').notNull(),
		note: text('note'),
		createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }),
		createdAt: integer('created_at').notNull(),
		updatedBy: integer('updated_by').references(() => users.id, { onDelete: 'set null' }),
		updatedAt: integer('updated_at').notNull(),
		deletedAt: integer('deleted_at')
	},
	(table) => [
		uniqueIndex('occurrence_notes_series_date_idx').on(table.seriesId, table.occurrenceDate)
	]
);

export const journalEntries = sqliteTable(
	'journal_entries',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		userId: integer('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		day: text('day').notNull(),
		text: text('text').notNull().default(''),
		mood: text('mood'),
		createdAt: integer('created_at').notNull(),
		updatedAt: integer('updated_at').notNull(),
		deletedAt: integer('deleted_at')
	},
	(table) => [
		uniqueIndex('journal_entries_user_day_idx')
			.on(table.userId, table.day)
			.where(sql`${table.deletedAt} is null`),
		index('journal_entries_day_idx')
			.on(table.day)
			.where(sql`${table.deletedAt} is null`)
	]
);

export const MEDIA_KINDS = ['photo', 'video'] as const;
export type MediaKind = (typeof MEDIA_KINDS)[number];

export const media = sqliteTable(
	'media',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		entryId: integer('entry_id').references(() => entries.id, { onDelete: 'cascade' }),
		occurrenceNoteId: integer('occurrence_note_id').references(() => occurrenceNotes.id, {
			onDelete: 'cascade'
		}),
		journalEntryId: integer('journal_entry_id').references(() => journalEntries.id, {
			onDelete: 'cascade'
		}),
		kind: text('kind', { enum: MEDIA_KINDS }).notNull(),
		mime: text('mime').notNull(),
		storedName: text('stored_name').notNull(),
		thumbName: text('thumb_name'),
		posterName: text('poster_name'),
		size: integer('size').notNull(),
		width: integer('width'),
		height: integer('height'),
		originalName: text('original_name').notNull(),
		createdBy: integer('created_by').references(() => users.id, { onDelete: 'set null' }),
		createdAt: integer('created_at').notNull(),
		deletedAt: integer('deleted_at')
	},
	(table) => [
		index('media_entry_idx').on(table.entryId),
		index('media_occurrence_note_idx').on(table.occurrenceNoteId),
		index('media_journal_entry_idx').on(table.journalEntryId),
		check('media_kind_check', inList(table.kind, MEDIA_KINDS)),
		check(
			'media_one_owner_check',
			sql`(
				(case when ${table.entryId} is not null then 1 else 0 end) +
				(case when ${table.occurrenceNoteId} is not null then 1 else 0 end) +
				(case when ${table.journalEntryId} is not null then 1 else 0 end)
			) = 1`
		)
	]
);

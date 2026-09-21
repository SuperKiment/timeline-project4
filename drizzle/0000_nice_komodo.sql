CREATE TABLE `entries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`type` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`location` text,
	`tags` text DEFAULT '[]' NOT NULL,
	`start_sort` text NOT NULL,
	`start_precision` text NOT NULL,
	`end_sort` text,
	`end_precision` text,
	`recurrence_freq` text,
	`seed_key` text,
	`created_by` integer,
	`created_at` integer NOT NULL,
	`updated_by` integer,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "entries_type_check" CHECK("entries"."type" in ('souvenir','important','phase','recurrent','histoire')),
	CONSTRAINT "entries_start_precision_check" CHECK("entries"."start_precision" in ('day','month','year')),
	CONSTRAINT "entries_end_precision_check" CHECK("entries"."end_precision" is null or "entries"."end_precision" in ('day','month','year')),
	CONSTRAINT "entries_recurrence_freq_check" CHECK("entries"."recurrence_freq" is null or "entries"."recurrence_freq" in ('yearly','monthly'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `entries_seed_key_unique` ON `entries` (`seed_key`);--> statement-breakpoint
CREATE INDEX `entries_start_sort_idx` ON `entries` (`start_sort`);--> statement-breakpoint
CREATE INDEX `entries_type_idx` ON `entries` (`type`);--> statement-breakpoint
CREATE TABLE `journal_entries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`day` text NOT NULL,
	`text` text DEFAULT '' NOT NULL,
	`mood` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `journal_entries_user_day_idx` ON `journal_entries` (`user_id`,`day`) WHERE "journal_entries"."deleted_at" is null;--> statement-breakpoint
CREATE TABLE `media` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`entry_id` integer,
	`occurrence_note_id` integer,
	`journal_entry_id` integer,
	`kind` text NOT NULL,
	`mime` text NOT NULL,
	`stored_name` text NOT NULL,
	`thumb_name` text,
	`poster_name` text,
	`size` integer NOT NULL,
	`width` integer,
	`height` integer,
	`original_name` text NOT NULL,
	`created_by` integer,
	`created_at` integer NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`entry_id`) REFERENCES `entries`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`occurrence_note_id`) REFERENCES `occurrence_notes`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`journal_entry_id`) REFERENCES `journal_entries`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "media_kind_check" CHECK("media"."kind" in ('photo','video')),
	CONSTRAINT "media_one_owner_check" CHECK((
				(case when "media"."entry_id" is not null then 1 else 0 end) +
				(case when "media"."occurrence_note_id" is not null then 1 else 0 end) +
				(case when "media"."journal_entry_id" is not null then 1 else 0 end)
			) = 1)
);
--> statement-breakpoint
CREATE INDEX `media_entry_idx` ON `media` (`entry_id`);--> statement-breakpoint
CREATE INDEX `media_occurrence_note_idx` ON `media` (`occurrence_note_id`);--> statement-breakpoint
CREATE INDEX `media_journal_entry_idx` ON `media` (`journal_entry_id`);--> statement-breakpoint
CREATE TABLE `occurrence_notes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`series_id` integer NOT NULL,
	`occurrence_date` text NOT NULL,
	`note` text,
	`created_by` integer,
	`created_at` integer NOT NULL,
	`updated_by` integer,
	`updated_at` integer NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`series_id`) REFERENCES `entries`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `occurrence_notes_series_date_idx` ON `occurrence_notes` (`series_id`,`occurrence_date`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` integer NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`username` text NOT NULL,
	`display_name` text NOT NULL,
	`password_hash` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username`);
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import type { FuzzyFormFields } from '../../dates/fuzzy-form';
import { entries, journalEntries, users } from '../db/schema';
import { createTestDb } from '../db/test-db';
import {
	createEntry,
	getEntry,
	listJournalDaysForEntry,
	softDeleteEntry,
	updateEntry
} from './service';
import { validateEntryInput, type RawEntryInput } from './validate';

const now = Date.now();

function insertUser(db: ReturnType<typeof createTestDb>, username: string, displayName: string) {
	return db
		.insert(users)
		.values({ username, displayName, passwordHash: 'x', createdAt: now })
		.returning({ id: users.id })
		.get().id;
}

const blankFields: FuzzyFormFields = { precision: 'day', year: '', month: '', day: '' };

function dayFields(year: number, month: number, day: number): FuzzyFormFields {
	return { precision: 'day', year: String(year), month: String(month), day: String(day) };
}

function yearFields(year: number): FuzzyFormFields {
	return { precision: 'year', year: String(year), month: '', day: '' };
}

function monthFields(year: number, month: number): FuzzyFormFields {
	return { precision: 'month', year: String(year), month: String(month), day: '' };
}

describe('validateEntryInput', () => {
	it('accepts a valid souvenir and normalizes text/tags', () => {
		const result = validateEntryInput({
			type: 'souvenir',
			title: '  Voyage  ',
			location: '  Kyoto  ',
			start: dayFields(2020, 1, 5),
			tags: [' plage ', 'plage', '', 42]
		});

		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value.title).toBe('Voyage');
		expect(result.value.location).toBe('Kyoto');
		expect(result.value.tags).toEqual(['plage']);
		expect(result.value.end).toBeNull();
	});

	it('requires a title', () => {
		const result = validateEntryInput({
			type: 'souvenir',
			title: '   ',
			start: yearFields(2020)
		});
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.errors.title).toBeTruthy();
	});

	it('requires a start date', () => {
		const result = validateEntryInput({ type: 'souvenir', title: 'x' });
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.errors.start).toBeTruthy();
	});

	it('rejects an invalid start date', () => {
		const result = validateEntryInput({
			type: 'souvenir',
			title: 'x',
			start: dayFields(2020, 2, 30)
		});
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.errors.start).toBeTruthy();
	});

	it('rejects an end date for souvenir/important', () => {
		const result = validateEntryInput({
			type: 'important',
			title: 'x',
			start: yearFields(2020),
			end: yearFields(2021)
		});
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.errors.end).toBeTruthy();
	});

	it('accepts an end date for phase and histoire', () => {
		for (const type of ['phase', 'histoire'] as const) {
			const result = validateEntryInput({
				type,
				title: 'x',
				start: yearFields(2020),
				end: yearFields(2021)
			});
			expect(result.ok).toBe(true);
		}
	});

	it('treats all-blank end fields as no end', () => {
		const result = validateEntryInput({
			type: 'phase',
			title: 'x',
			start: yearFields(2020),
			end: blankFields
		});
		expect(result.ok).toBe(true);
		if (result.ok) expect(result.value.end).toBeNull();
	});

	it('rejects an end before the start (EC-2)', () => {
		const result = validateEntryInput({
			type: 'phase',
			title: 'x',
			start: dayFields(2021, 1, 1),
			end: dayFields(2020, 1, 1)
		});
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.errors.end).toBeTruthy();
	});

	it('requires a day-precision start and a frequency for recurrent entries', () => {
		const missingFreq = validateEntryInput({
			type: 'recurrent',
			title: 'x',
			start: dayFields(2020, 1, 1)
		});
		expect(missingFreq.ok).toBe(false);
		if (!missingFreq.ok) expect(missingFreq.errors.recurrenceFreq).toBeTruthy();

		const monthPrecisionStart = validateEntryInput({
			type: 'recurrent',
			title: 'x',
			start: monthFields(2020, 1),
			recurrenceFreq: 'yearly'
		});
		expect(monthPrecisionStart.ok).toBe(false);
		if (!monthPrecisionStart.ok) expect(monthPrecisionStart.errors.start).toBeTruthy();

		const monthPrecisionEnd = validateEntryInput({
			type: 'recurrent',
			title: 'x',
			start: dayFields(2020, 1, 1),
			end: monthFields(2021, 1),
			recurrenceFreq: 'yearly'
		});
		expect(monthPrecisionEnd.ok).toBe(false);
		if (!monthPrecisionEnd.ok) expect(monthPrecisionEnd.errors.end).toBeTruthy();

		const valid = validateEntryInput({
			type: 'recurrent',
			title: 'x',
			start: dayFields(2020, 1, 1),
			recurrenceFreq: 'monthly'
		});
		expect(valid.ok).toBe(true);
	});

	it('rejects an unknown type', () => {
		const result = validateEntryInput({
			type: 'unknown',
			title: 'x',
			start: yearFields(2020)
		});
		expect(result.ok).toBe(false);
		if (!result.ok) expect(result.errors.type).toBeTruthy();
	});
});

describe('entries service', () => {
	it('creates all 5 entry types', () => {
		const db = createTestDb();
		const userId = insertUser(db, 'alice', 'Alice');

		const inputs: RawEntryInput[] = [
			{
				type: 'souvenir',
				title: 'Souvenir',
				start: dayFields(2020, 1, 1)
			},
			{
				type: 'important',
				title: 'Important',
				start: dayFields(2020, 1, 1)
			},
			{
				type: 'phase',
				title: 'Phase',
				start: yearFields(2019),
				end: yearFields(2021)
			},
			{
				type: 'histoire',
				title: 'Histoire',
				start: dayFields(2001, 9, 11)
			},
			{
				type: 'recurrent',
				title: 'Récurrent',
				start: dayFields(2020, 1, 1),
				recurrenceFreq: 'yearly'
			}
		];

		for (const raw of inputs) {
			const result = validateEntryInput(raw);
			expect(result.ok).toBe(true);
			if (!result.ok) continue;
			const row = createEntry(db, result.value, userId, now);
			expect(row.type).toBe(raw.type);
			expect(row.id).toBeGreaterThan(0);
			expect(row.createdBy).toBe(userId);
		}
	});

	it('does not return a soft-deleted entry (FR-25)', () => {
		const db = createTestDb();
		const userId = insertUser(db, 'alice', 'Alice');
		const created = validateEntryInput({
			type: 'souvenir',
			title: 'x',
			start: dayFields(2020, 1, 1)
		});
		if (!created.ok) throw new Error('unexpected validation failure');
		const row = createEntry(db, created.value, userId, now);

		expect(getEntry(db, row.id)).not.toBeNull();

		softDeleteEntry(db, row.id, now + 1);

		expect(getEntry(db, row.id)).toBeNull();
	});

	it('keeps the original deleted_at when soft-deleting an already-deleted entry', () => {
		const db = createTestDb();
		const userId = insertUser(db, 'alice', 'Alice');
		const created = validateEntryInput({
			type: 'souvenir',
			title: 'x',
			start: dayFields(2020, 1, 1)
		});
		if (!created.ok) throw new Error('unexpected validation failure');
		const row = createEntry(db, created.value, userId, now);

		softDeleteEntry(db, row.id, now + 1);
		softDeleteEntry(db, row.id, now + 2);

		const [deletedRow] = db.select().from(entries).where(eq(entries.id, row.id)).all();
		expect(deletedRow.deletedAt).toBe(now + 1);
	});

	it('stores updated_by/updated_at on update', () => {
		const db = createTestDb();
		const alice = insertUser(db, 'alice', 'Alice');
		const bob = insertUser(db, 'bob', 'Bob');
		const created = validateEntryInput({
			type: 'souvenir',
			title: 'x',
			start: dayFields(2020, 1, 1)
		});
		if (!created.ok) throw new Error('unexpected validation failure');
		const row = createEntry(db, created.value, alice, now);

		const updated = validateEntryInput({
			type: 'souvenir',
			title: 'y',
			start: dayFields(2020, 1, 1)
		});
		if (!updated.ok) throw new Error('unexpected validation failure');
		const later = now + 1000;
		const result = updateEntry(db, row.id, updated.value, bob, later);

		expect(result?.title).toBe('y');
		expect(result?.updatedBy).toBe(bob);
		expect(result?.updatedAt).toBe(later);
		expect(result?.createdBy).toBe(alice);
	});

	it('returns null when updating a missing or deleted entry', () => {
		const db = createTestDb();
		const alice = insertUser(db, 'alice', 'Alice');
		const created = validateEntryInput({
			type: 'souvenir',
			title: 'x',
			start: dayFields(2020, 1, 1)
		});
		if (!created.ok) throw new Error('unexpected validation failure');

		expect(updateEntry(db, 999, created.value, alice, now)).toBeNull();

		const row = createEntry(db, created.value, alice, now);
		softDeleteEntry(db, row.id, now + 1);
		expect(updateEntry(db, row.id, created.value, alice, now + 2)).toBeNull();
	});

	it('links journal days with visible entries within the entry period (FR-13)', () => {
		const db = createTestDb();
		const alice = insertUser(db, 'alice', 'Alice');
		const bob = insertUser(db, 'bob', 'Bob');

		const created = validateEntryInput({
			type: 'phase',
			title: 'Vacances',
			start: dayFields(2020, 7, 1),
			end: dayFields(2020, 7, 10)
		});
		if (!created.ok) throw new Error('unexpected validation failure');
		const entry = createEntry(db, created.value, alice, now);

		db.insert(journalEntries)
			.values({ userId: alice, day: '2020-07-02', text: 'a', createdAt: now, updatedAt: now })
			.run();
		db.insert(journalEntries)
			.values({ userId: bob, day: '2020-07-02', text: 'b', createdAt: now, updatedAt: now })
			.run();
		db.insert(journalEntries)
			.values({
				userId: alice,
				day: '2020-07-03',
				text: 'deleted',
				createdAt: now,
				updatedAt: now,
				deletedAt: now
			})
			.run();
		db.insert(journalEntries)
			.values({ userId: alice, day: '2020-08-01', text: 'outside', createdAt: now, updatedAt: now })
			.run();

		const days = listJournalDaysForEntry(db, entry, '2020-07-10');

		expect(days).toEqual([{ day: '2020-07-02', authors: ['Alice', 'Bob'] }]);
	});

	it('caps the journal-link range to the most recent 366 days for an open-ended entry', () => {
		const db = createTestDb();
		const alice = insertUser(db, 'alice', 'Alice');
		const created = validateEntryInput({
			type: 'histoire',
			title: 'Longue',
			start: dayFields(2000, 1, 1)
		});
		if (!created.ok) throw new Error('unexpected validation failure');
		const entry = createEntry(db, created.value, alice, now);

		db.insert(journalEntries)
			.values({ userId: alice, day: '2025-06-01', text: 'recent', createdAt: now, updatedAt: now })
			.run();
		db.insert(journalEntries)
			.values({ userId: alice, day: '2000-06-01', text: 'oldest', createdAt: now, updatedAt: now })
			.run();

		const days = listJournalDaysForEntry(db, entry, '2026-01-01');

		expect(days).toEqual([{ day: '2025-06-01', authors: ['Alice'] }]);
	});
});

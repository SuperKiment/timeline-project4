import Database from 'better-sqlite3';
import { expect, test } from '@playwright/test';
import { ALICE_STATE, parisToday } from './helpers';

/**
 * Writes alice's journal entry for today straight into the e2e SQLite DB
 * (the journal write UI/API belongs to T34 and is not used here). Idempotent:
 * `INSERT OR IGNORE` hits the partial unique index (user_id, day) when the
 * entry already exists.
 *
 * COUPLING: the test asserts bob has NO marker today, which only holds while
 * no spec makes bob write today's journal entry (T34's journal.spec must only
 * have alice write).
 */
function seedAliceToday(day: string): void {
	const db = new Database('.e2e-data/timeline.sqlite');
	try {
		db.pragma('busy_timeout = 5000');
		const alice = db.prepare('SELECT id FROM users WHERE username = ?').get('alice') as
			{ id: number } | undefined;
		if (!alice) throw new Error('alice not seeded');
		const now = Date.now();
		db.prepare(
			`INSERT OR IGNORE INTO journal_entries (user_id, day, text, mood, created_at, updated_at)
			 VALUES (?, ?, ?, NULL, ?, ?)`
		).run(alice.id, day, 'Journée test calendrier', now, now);
	} finally {
		db.close();
	}
}

test.use({ storageState: ALICE_STATE });

test('today cell shows the author marker of alice and not bob (FR-19)', async ({ page }) => {
	const today = parisToday();
	seedAliceToday(today);

	await page.goto('/journal/calendrier');

	const cell = page.locator(`[data-day="${today}"]`);
	await expect(cell).toBeVisible();
	await expect(cell.getByRole('img', { name: 'Alice a écrit' })).toBeVisible();
	await expect(cell.getByRole('img', { name: 'Bob a écrit' })).toHaveCount(0);
	await expect(cell).toHaveAttribute('href', `/journal/${today}`);
});

test('invalid ?mois falls back to the current month and prev/next navigate', async ({ page }) => {
	const response = await page.goto('/journal/calendrier?mois=abc');
	expect(response?.status()).toBe(200);
	await expect(page.getByRole('heading', { level: 2 })).toBeVisible();

	await page.getByRole('link', { name: /Mois suivant/ }).click();
	await expect(page).toHaveURL(/mois=\d{4}-\d{2}/);
});

import { expect, type Page } from '@playwright/test';

export interface TestUser {
	username: string;
	password: string;
}

/** Seeded by `e2e/prepare.sh` (password `motdepasse-test` for both). */
export const ALICE: TestUser = { username: 'alice', password: 'motdepasse-test' };
export const BOB: TestUser = { username: 'bob', password: 'motdepasse-test' };

/** Fills and submits the login form for `user`, waiting for the resulting navigation. */
export async function login(page: Page, user: TestUser): Promise<void> {
	await page.goto('/login');
	await page.getByLabel('Identifiant').fill(user.username);
	await page.getByLabel('Mot de passe').fill(user.password);
	await page.getByRole('button', { name: 'Se connecter' }).click();
	await page.waitForURL((url) => url.pathname !== '/login');
}

/** Saved sessions written by `auth.setup.ts`; opt in with `test.use({ storageState: ALICE_STATE })`. */
export const ALICE_STATE = 'e2e/.auth/alice.json';
export const BOB_STATE = 'e2e/.auth/bob.json';

/** YYYY-MM-DD of `offset` days before today in Europe/Paris (negative = future). */
export function pastDay(offset: number): string {
	const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date());
	const d = new Date(`${today}T00:00:00Z`);
	d.setUTCDate(d.getUTCDate() - offset);
	return d.toISOString().slice(0, 10);
}

/** Today's YYYY-MM-DD in Europe/Paris (the app timezone). */
export function parisToday(): string {
	return pastDay(0);
}

/** Tomorrow's YYYY-MM-DD in Europe/Paris. */
export function parisTomorrow(): string {
	return pastDay(-1);
}

/** Unique title, safe across parallel workers and projects sharing one DB. */
export function uniqueTitle(label: string): string {
	return `${label} ${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

/** Fills a fuzzy-date fieldset (precision radio, year, month, day) of the entry form. */
export async function fillDate(
	page: Page,
	group: string,
	fields: { precision?: 'Jour' | 'Mois' | 'Année'; year: string; month?: string; day?: string }
): Promise<void> {
	const fieldset = page.getByRole('group', { name: group, exact: true });
	if (fields.precision) {
		// The radio is visually hidden inside its segmented-control label.
		await fieldset.getByRole('radio', { name: fields.precision }).check({ force: true });
	}
	await fieldset.getByRole('textbox', { name: 'Année', exact: true }).fill(fields.year);
	if (fields.month)
		await fieldset.getByRole('combobox', { name: 'Mois', exact: true }).selectOption(fields.month);
	if (fields.day)
		await fieldset.getByRole('textbox', { name: 'Jour', exact: true }).fill(fields.day);
}

/** Creates an entry through the form and returns its detail URL path. */
export async function createEntry(
	page: Page,
	fields: {
		title: string;
		type?: string;
		description?: string;
		location?: string;
		tags?: string;
		date?: string;
	}
): Promise<string> {
	await page.goto(`/entries/new?date=${fields.date ?? '2024-05-01'}`);
	if (fields.type) await page.getByLabel('Type', { exact: true }).selectOption(fields.type);
	await page.getByLabel('Titre').fill(fields.title);
	if (fields.description) await page.getByLabel('Description').fill(fields.description);
	if (fields.location) await page.getByLabel('Lieu').fill(fields.location);
	if (fields.tags) await page.getByLabel('Tags').fill(fields.tags);
	await page.getByRole('button', { name: 'Créer' }).click();
	await expect(page).toHaveURL(/\/entries\/\d+$/);
	return new URL(page.url()).pathname;
}

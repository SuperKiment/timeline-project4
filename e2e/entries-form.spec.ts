import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { ALICE, login } from './helpers';

/** Unique per test and per project (desktop/mobile run in parallel on one DB). */
function uniqueTitle(testInfo: TestInfo, label: string): string {
	return `${label} ${testInfo.project.name} ${Date.now()}`;
}

async function fillDate(
	page: Page,
	group: string,
	fields: { precision?: 'Jour' | 'Mois' | 'Année'; year: string; month?: string; day?: string }
) {
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

test.beforeEach(async ({ page }) => {
	await login(page, ALICE);
});

test('phase with end before start shows a French error and keeps values (EC-2)', async ({
	page
}, testInfo) => {
	const title = uniqueTitle(testInfo, 'Phase invalide');
	await page.goto('/entries/new');
	await page.getByLabel('Type', { exact: true }).selectOption('phase');
	await page.getByLabel('Titre').fill(title);
	await fillDate(page, 'Début', { precision: 'Année', year: '2024' });
	await fillDate(page, 'Fin (vide = en cours)', { precision: 'Année', year: '2020' });
	await page.getByRole('button', { name: 'Créer' }).click();

	await expect(
		page.getByText('La date de fin ne peut pas être antérieure à la date de début.')
	).toBeVisible();
	await expect(page).toHaveURL(/\/entries\/new/);
	await expect(page.getByLabel('Titre')).toHaveValue(title);
	await expect(page.getByLabel('Type', { exact: true })).toHaveValue('phase');
	await expect(
		page
			.getByRole('group', { name: 'Début', exact: true })
			.getByRole('textbox', { name: 'Année', exact: true })
	).toHaveValue('2024');
	await expect(
		page
			.getByRole('group', { name: 'Fin (vide = en cours)', exact: true })
			.getByRole('textbox', { name: 'Année', exact: true })
	).toHaveValue('2020');
});

test('missing start date shows the fuzzy-form error', async ({ page }, testInfo) => {
	await page.goto('/entries/new');
	await page.getByLabel('Titre').fill(uniqueTitle(testInfo, 'Sans date'));
	await fillDate(page, 'Début', { year: '', month: '', day: '' });
	await page.getByRole('button', { name: 'Créer' }).click();

	await expect(page.getByText("L'année est requise.")).toBeVisible();
});

test('souvenir with month precision redirects to the detail URL', async ({ page }, testInfo) => {
	await page.goto('/entries/new');
	await page.getByLabel('Titre').fill(uniqueTitle(testInfo, 'Souvenir mois'));
	await fillDate(page, 'Début', { precision: 'Mois', year: '2023', month: '6' });
	await page.getByLabel('Tags').fill('été, plage');
	await page.getByRole('button', { name: 'Créer' }).click();

	await expect(page).toHaveURL(/\/entries\/\d+$/);
});

test('query string prefills type and date (FR-18)', async ({ page }) => {
	await page.goto('/entries/new?type=souvenir&date=2024-05-01');

	await expect(page.getByLabel('Type', { exact: true })).toHaveValue('souvenir');
	const start = page.getByRole('group', { name: 'Début', exact: true });
	await expect(start.getByRole('textbox', { name: 'Année', exact: true })).toHaveValue('2024');
	await expect(start.getByRole('combobox', { name: 'Mois', exact: true })).toHaveValue('5');
	await expect(start.getByRole('textbox', { name: 'Jour', exact: true })).toHaveValue('1');
});

test('edit page prefills, shows author info and saves (FR-6)', async ({ page }, testInfo) => {
	const title = uniqueTitle(testInfo, 'A modifier');
	await page.goto('/entries/new?type=important&date=2022-02-02');
	await page.getByLabel('Titre').fill(title);
	await page.getByRole('button', { name: 'Créer' }).click();
	await expect(page).toHaveURL(/\/entries\/\d+$/);
	const id = new URL(page.url()).pathname.split('/').pop();

	await page.goto(`/entries/${id}/edit`);
	await expect(page.getByLabel('Titre')).toHaveValue(title);
	await expect(
		page.getByText(
			/^Créé par Alice le \d{1,2} \p{L}+ \d{4} à \d{2}:\d{2}, modifié par Alice le \d{1,2} \p{L}+ \d{4} à \d{2}:\d{2}$/u
		)
	).toBeVisible();

	const updated = `${title} v2`;
	await page.getByLabel('Titre').fill(updated);
	await page.getByRole('button', { name: 'Enregistrer' }).click();
	await expect(page).toHaveURL(new RegExp(`/entries/${id}$`));

	await page.goto(`/entries/${id}/edit`);
	await expect(page.getByLabel('Titre')).toHaveValue(updated);
});

test('edit page 404s for a missing entry', async ({ page }) => {
	const response = await page.goto('/entries/999999999/edit');
	expect(response?.status()).toBe(404);
});

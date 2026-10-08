import { expect, test } from '@playwright/test';
import { ALICE_STATE, fillDate, uniqueTitle } from './helpers';

test.use({ storageState: ALICE_STATE });

test('phase with end before start shows a French error and keeps values (EC-2)', async ({
	page
}) => {
	const title = uniqueTitle('Phase invalide');
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

test('query prefills the form; created entry is editable from its detail page (FR-18, FR-6)', async ({
	page
}) => {
	await page.goto('/entries/new?type=important&date=2022-02-02');
	await expect(page.getByLabel('Type', { exact: true })).toHaveValue('important');
	const start = page.getByRole('group', { name: 'Début', exact: true });
	await expect(start.getByRole('textbox', { name: 'Année', exact: true })).toHaveValue('2022');
	await expect(start.getByRole('combobox', { name: 'Mois', exact: true })).toHaveValue('2');
	await expect(start.getByRole('textbox', { name: 'Jour', exact: true })).toHaveValue('2');

	const title = uniqueTitle('A modifier');
	await page.getByLabel('Titre').fill(title);
	await page.getByRole('button', { name: 'Créer' }).click();
	await expect(page).toHaveURL(/\/entries\/\d+$/, { timeout: 15_000 });
	const path = new URL(page.url()).pathname;

	await page.getByRole('link', { name: 'Modifier' }).click();
	await expect(page).toHaveURL(`${path}/edit`);
	await expect(page.getByLabel('Titre')).toHaveValue(title);
	await expect(
		page.getByText(
			/^Créé par Alice le \d{1,2} \p{L}+ \d{4} à \d{2}:\d{2}, modifié par Alice le \d{1,2} \p{L}+ \d{4} à \d{2}:\d{2}$/u
		)
	).toBeVisible();

	const updated = `${title} v2`;
	await page.getByLabel('Titre').fill(updated);
	await page.getByRole('button', { name: 'Enregistrer' }).click();
	await expect(page).toHaveURL(path, { timeout: 15_000 });

	await page.goto(`${path}/edit`);
	await expect(page.getByLabel('Titre')).toHaveValue(updated);
});

test.describe('without JavaScript', () => {
	test.use({ javaScriptEnabled: false });

	// Also what a slow phone sends when "Créer" is tapped before hydration.
	test('the form still creates an entry with its date', async ({ page }) => {
		const title = uniqueTitle('Sans JS');
		await page.goto('/entries/new');
		await page.getByLabel('Titre').fill(title);
		await fillDate(page, 'Début', { precision: 'Jour', year: '2021', month: '7', day: '14' });
		await page.getByRole('button', { name: 'Créer' }).click();

		await expect(page).toHaveURL(/\/entries\/\d+$/);
		await expect(page.getByRole('heading', { name: title })).toBeVisible();
		await expect(page.getByText('2021')).toBeVisible();
	});
});

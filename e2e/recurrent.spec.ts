import { expect, test } from '@playwright/test';
import { ALICE_STATE, uniqueTitle } from './helpers';

test.use({ storageState: ALICE_STATE });

test('annotates one occurrence of a yearly series, other occurrences stay empty (AC-5, FR-7)', async ({
	page
}) => {
	test.setTimeout(90_000);
	const title = uniqueTitle('Anniversaire');
	const note = uniqueTitle('Note');
	const year = new Date().getFullYear();
	const annotated = `${year - 2}-01-01`;
	const other = `${year - 1}-01-01`;

	await page.goto('/entries/new');
	await page.getByLabel('Type', { exact: true }).selectOption('recurrent');
	await page.getByLabel('Titre').fill(title);
	const origin = page.getByRole('group', { name: "Date d'origine", exact: true });
	await origin.getByRole('textbox', { name: 'Année', exact: true }).fill(String(year - 3));
	await origin.getByRole('combobox', { name: 'Mois', exact: true }).selectOption('1');
	await origin.getByRole('textbox', { name: 'Jour', exact: true }).fill('1');
	await page.getByRole('button', { name: 'Créer' }).click();
	await expect(page).toHaveURL(/\/entries\/(\d+)$/, { timeout: 15_000 });
	const seriesPath = new URL(page.url()).pathname;

	const occurrenceLink = (date: string) =>
		page.locator(`a[href="${seriesPath}/occurrences/${date}"]`);

	// Annotate one occurrence with a note and a photo.
	await occurrenceLink(annotated).click();
	await expect(page.getByRole('heading', { level: 1, name: title })).toBeVisible();
	await page.getByLabel('Note pour cette occurrence').fill(note);
	await page.getByRole('button', { name: 'Enregistrer' }).click();
	await expect(page.getByText('Note enregistrée.')).toBeVisible();

	const gallery = page.getByRole('region', { name: 'Médias' });
	await page.locator('input[type="file"]').setInputFiles('tests/fixtures/photo-exif-rotated.jpg');
	await expect(gallery.locator('ul.grid > li')).toHaveCount(1, { timeout: 60_000 });

	// Persisted on reload.
	await page.reload();
	await expect(page.getByLabel('Note pour cette occurrence')).toHaveValue(note);
	await expect(gallery.locator('ul.grid > li')).toHaveCount(1);

	// Shown in the series detail list, on that occurrence only.
	await page.goto(seriesPath);
	await expect(occurrenceLink(annotated)).toContainText(note);
	await expect(occurrenceLink(annotated)).toContainText('1 média');
	await expect(occurrenceLink(other)).not.toContainText(note);
	await expect(occurrenceLink(other)).not.toContainText('média');

	// Another occurrence page shows neither note nor photo.
	await occurrenceLink(other).click();
	await expect(page.getByLabel('Note pour cette occurrence')).toHaveValue('');
	await expect(gallery.locator('ul.grid > li')).toHaveCount(0);
});

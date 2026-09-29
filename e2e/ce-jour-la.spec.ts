import { expect, test } from '@playwright/test';
import { ALICE_STATE, fillDate, parisToday, uniqueTitle } from './helpers';

/** Current hour/minute in Europe/Paris. */
function parisClock(): { hour: number; minute: number } {
	const [hour, minute] = new Intl.DateTimeFormat('en-GB', {
		timeZone: 'Europe/Paris',
		hour: '2-digit',
		minute: '2-digit',
		hourCycle: 'h23'
	})
		.format(new Date())
		.split(':')
		.map(Number);
	return { hour, minute };
}

test.use({ storageState: ALICE_STATE });

test('a souvenir dated today two years ago (four on 29 Feb) appears under "Il y a N ans" (FR-20, AC-10)', async ({
	page
}) => {
	const { hour, minute } = parisClock();
	test.skip(hour === 23 && minute >= 58, 'Paris date may roll over mid-test');
	const [year, month, day] = parisToday().split('-').map(Number);
	// 29 Feb only exists 4 years back (leap cycle), so use 4 there and 2 otherwise.
	const yearsAgo = month === 2 && day === 29 ? 4 : 2;
	const pastYear = year - yearsAgo;
	const title = uniqueTitle('Ce jour-là');

	await page.goto('/entries/new');
	await page.getByLabel('Type', { exact: true }).selectOption('souvenir');
	await page.getByLabel('Titre').fill(title);
	await fillDate(page, 'Début', {
		precision: 'Jour',
		year: String(pastYear),
		month: String(month),
		day: String(day)
	});
	await page.getByRole('button', { name: 'Créer' }).click();
	await expect(page).toHaveURL(/\/entries\/\d+$/);

	await page.goto('/ce-jour-la');
	await expect(
		page.getByRole('heading', { level: 1, name: /^Ce jour-là — \d{1,2} \p{L}+$/u })
	).toBeVisible();
	const section = page
		.locator('section')
		.filter({ has: page.getByRole('heading', { name: `Il y a ${yearsAgo} ans — ${pastYear}` }) });
	await expect(section.getByRole('link', { name: new RegExp(title) })).toBeVisible();
});

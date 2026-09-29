import { expect, test } from '@playwright/test';
import { ALICE, login } from './helpers';

/** Today's date parts in Europe/Paris (the app timezone). */
function parisToday(): { year: number; month: number; day: number } {
	const [year, month, day] = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' })
		.format(new Date())
		.split('-')
		.map(Number);
	return { year, month, day };
}

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

test('a souvenir dated today two years ago (four on 29 Feb) appears under "Il y a N ans" (FR-20, AC-10)', async ({
	page
}, testInfo) => {
	const { hour, minute } = parisClock();
	test.skip(hour === 23 && minute >= 58, 'Paris date may roll over mid-test');
	const { year, month, day } = parisToday();
	// 29 Feb only exists 4 years back (leap cycle), so use 4 there and 2 otherwise.
	const yearsAgo = month === 2 && day === 29 ? 4 : 2;
	const pastYear = year - yearsAgo;
	const title = `Ce jour-là ${testInfo.project.name} ${Date.now()}`;

	await login(page, ALICE);
	await page.goto('/entries/new');
	await page.getByLabel('Type', { exact: true }).selectOption('souvenir');
	await page.getByLabel('Titre').fill(title);
	const start = page.getByRole('group', { name: 'Début', exact: true });
	await start.getByRole('radio', { name: 'Jour' }).check({ force: true });
	await start.getByRole('textbox', { name: 'Année', exact: true }).fill(String(pastYear));
	await start.getByRole('combobox', { name: 'Mois', exact: true }).selectOption(String(month));
	await start.getByRole('textbox', { name: 'Jour', exact: true }).fill(String(day));
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

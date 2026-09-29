import { expect, test, type Page } from '@playwright/test';
import { ALICE, login } from './helpers';

type Precision = 'Jour' | 'Mois' | 'Année';

interface Item {
	type: 'souvenir' | 'important' | 'phase' | 'recurrent' | 'histoire';
	title: string;
	precision?: Precision;
	year: string;
	month?: string;
	day?: string;
}

/** ISO day of `now` in the app timezone, shifted by `offsetDays`. */
function isoDayOffset(offsetDays: number): string {
	const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date());
	const date = new Date(`${today}T00:00:00Z`);
	date.setUTCDate(date.getUTCDate() + offsetDays);
	return date.toISOString().slice(0, 10);
}

function dayParts(offsetDays: number) {
	const [year, month, day] = isoDayOffset(offsetDays).split('-').map(Number);
	return { year: String(year), month: String(month), day: String(day) };
}

async function fillDate(page: Page, group: string, item: Omit<Item, 'type' | 'title'>) {
	const fieldset = page.getByRole('group', { name: group, exact: true });
	if (item.precision) {
		await fieldset.getByRole('radio', { name: item.precision }).check({ force: true });
	}
	await fieldset.getByRole('textbox', { name: 'Année', exact: true }).fill(item.year);
	if (item.month)
		await fieldset.getByRole('combobox', { name: 'Mois', exact: true }).selectOption(item.month);
	if (item.day) await fieldset.getByRole('textbox', { name: 'Jour', exact: true }).fill(item.day);
}

async function createItem(page: Page, item: Item) {
	await page.goto('/entries/new');
	await page.getByLabel('Type', { exact: true }).selectOption(item.type);
	await page.getByLabel('Titre').fill(item.title);
	const startGroup = item.type === 'recurrent' ? "Date d'origine" : 'Début';
	await fillDate(page, startGroup, item);
	if (item.type === 'recurrent') {
		// End = start: exactly one occurrence, so the item count stays deterministic.
		await fillDate(page, 'Fin de la série (optionnelle)', item);
	}
	await page.getByRole('button', { name: 'Créer' }).click();
	await expect(page).toHaveURL(/\/entries\/\d+$/);
}

// Serial: items are created once per project (beforeAll) and shared by the tests.
// All dates are within ~100 days of today so they stay inside the horizontal
// view's initial viewport (1 px/day) even at mobile width.
test.describe.configure({ mode: 'serial' });

let prefix = '';
let titles: Record<Item['type'], string>;

test.beforeAll(async ({ browser }, testInfo) => {
	test.setTimeout(120_000);
	prefix = `T33 ${testInfo.project.name} ${Date.now()}${Math.floor(Math.random() * 1000)}`;
	titles = {
		souvenir: `${prefix} souvenir`,
		important: `${prefix} important`,
		phase: `${prefix} phase`,
		recurrent: `${prefix} recurrent`,
		histoire: `${prefix} histoire`
	};

	const year = dayParts(-100).year;
	const month = dayParts(-60);
	const phase = dayParts(-40);
	const recurrent = dayParts(-20);
	const histoire = dayParts(-10);

	const context = await browser.newContext({ baseURL: testInfo.project.use.baseURL });
	const page = await context.newPage();
	await login(page, ALICE);
	// Sort order: year < month < day keys (EC-3), oldest first.
	await createItem(page, { type: 'souvenir', title: titles.souvenir, precision: 'Année', year });
	await createItem(page, {
		type: 'important',
		title: titles.important,
		precision: 'Mois',
		year: month.year,
		month: month.month
	});
	await createItem(page, { type: 'phase', title: titles.phase, precision: 'Jour', ...phase });
	await createItem(page, { type: 'recurrent', title: titles.recurrent, ...recurrent });
	await createItem(page, {
		type: 'histoire',
		title: titles.histoire,
		precision: 'Jour',
		...histoire
	});
	await context.close();
});

test.beforeEach(async ({ page }) => {
	await login(page, ALICE);
	await page.goto('/');
});

/** Titles of this run's items, in DOM order, for the vertical view. */
async function verticalTitles(page: Page): Promise<string[]> {
	return page.locator('a.card h3', { hasText: prefix }).allTextContents();
}

/** Titles of this run's items, in DOM order, for the horizontal view. */
async function horizontalTitles(page: Page): Promise<string[]> {
	const labels = await page
		.locator(`a[aria-label*="${prefix}"]`)
		.evaluateAll((links) => links.map((link) => link.getAttribute('aria-label') ?? ''));
	return labels.map((label) => label.split(' — ')[0]);
}

test('vertical view orders items by fuzzy date across precisions (AC-3, FR-9)', async ({
	page
}) => {
	await page.getByRole('button', { name: 'Vertical', exact: true }).click();
	await expect(page.locator('a.card h3', { hasText: prefix })).toHaveCount(5);

	expect(await verticalTitles(page)).toEqual([
		titles.souvenir,
		titles.important,
		titles.phase,
		titles.recurrent,
		titles.histoire
	]);
});

test('horizontal view lists phases, then main items, then histoire (FR-10)', async ({ page }) => {
	await page.getByRole('button', { name: 'Horizontal', exact: true }).click();
	await expect(page.locator(`a[aria-label*="${prefix}"]`)).toHaveCount(5);

	// Track order in the DOM: phase lanes, main track (by date), histoire track.
	expect(await horizontalTitles(page)).toEqual([
		titles.phase,
		titles.souvenir,
		titles.important,
		titles.recurrent,
		titles.histoire
	]);
});

test('hiding the histoire filter removes histoire items (FR-11)', async ({ page }) => {
	await page.getByRole('button', { name: 'Vertical', exact: true }).click();
	const mine = page.locator('a.card h3', { hasText: prefix });
	await expect(mine).toHaveCount(5);

	const chip = page.getByRole('button', { name: 'Histoire', exact: true });
	await expect(chip).toHaveAttribute('aria-pressed', 'true');
	await chip.click();

	await expect(page).toHaveURL(
		/types=souvenir%2Cimportant%2Cphase%2Crecurrent|types=souvenir,important,phase,recurrent/
	);
	await expect(chip).toHaveAttribute('aria-pressed', 'false');
	await expect(mine).toHaveCount(4);
	await expect(page.locator('a.card h3', { hasText: titles.histoire })).toHaveCount(0);

	// Filtered state survives a reload via the URL, and toggling back restores everything.
	await page.reload();
	await expect(page.getByRole('button', { name: 'Histoire', exact: true })).toHaveAttribute(
		'aria-pressed',
		'false'
	);
	await page.getByRole('button', { name: 'Histoire', exact: true }).click();
	await expect(page.locator('a.card h3', { hasText: prefix })).toHaveCount(5);
});

test('view toggle choice persists after reload (FR-9)', async ({ page }) => {
	const horizontal = page.getByRole('button', { name: 'Horizontal', exact: true });
	const vertical = page.getByRole('button', { name: 'Vertical', exact: true });

	await horizontal.click();
	await expect(horizontal).toHaveAttribute('aria-pressed', 'true');
	await page.reload();
	await expect(horizontal).toHaveAttribute('aria-pressed', 'true');
	await expect(vertical).toHaveAttribute('aria-pressed', 'false');

	await vertical.click();
	await page.reload();
	await expect(vertical).toHaveAttribute('aria-pressed', 'true');
});

test('home links to "Ce jour-là" and offers an always-visible add button (FR-20)', async ({
	page
}) => {
	await expect(page.getByRole('link', { name: 'Ce jour-là', exact: true }).first()).toBeVisible();
	const fab = page.getByRole('link', { name: 'Ajouter', exact: true });
	await expect(fab).toBeVisible();
	const box = await fab.boundingBox();
	expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
});

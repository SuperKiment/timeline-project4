import { expect, test } from '@playwright/test';
import { ALICE_STATE } from './helpers';

const LINKS = [
	{ name: 'Timeline', path: '/' },
	{ name: 'Journal', path: '/journal' },
	{ name: 'Ce jour-là', path: '/ce-jour-la' },
	{ name: 'Recherche', path: '/recherche' },
	{ name: 'Corbeille', path: '/corbeille' },
	{ name: 'Paramètres', path: '/parametres' }
];

test.use({ storageState: ALICE_STATE });

test('navigation: hidden on /login, links visible, tappable and working, no horizontal overflow (AC-13)', async ({
	page,
	browser,
	baseURL
}) => {
	const anon = await browser.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
	const anonPage = await anon.newPage();
	await anonPage.goto('/login');
	await expect(anonPage.getByRole('navigation', { name: 'Navigation principale' })).toHaveCount(0);
	await anon.close();

	const nav = page.getByRole('navigation', { name: 'Navigation principale' });
	for (const { name, path } of LINKS) {
		// Start away from the target so the URL change is observable.
		await page.goto(path === '/parametres' ? '/' : '/parametres');
		const link = nav.getByRole('link', { name, exact: true });
		await expect(link).toBeVisible();
		const box = await link.boundingBox();
		expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
		await link.click();
		// /journal redirects to today's day page.
		await expect(page).toHaveURL((url) =>
			path === '/journal'
				? /^\/journal(\/\d{4}-\d{2}-\d{2})?$/.test(url.pathname)
				: url.pathname === path
		);
		expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
			true
		);
	}
});

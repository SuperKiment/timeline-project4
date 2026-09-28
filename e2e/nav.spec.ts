import { expect, test } from '@playwright/test';
import { ALICE, login } from './helpers';

const LINKS = [
	{ name: 'Timeline', path: '/' },
	{ name: 'Journal', path: '/journal' },
	{ name: 'Ce jour-là', path: '/ce-jour-la' },
	{ name: 'Recherche', path: '/recherche' },
	{ name: 'Corbeille', path: '/corbeille' },
	{ name: 'Paramètres', path: '/parametres' }
];

test('no navigation on /login', async ({ page }) => {
	await page.goto('/login');
	await expect(page.getByRole('navigation', { name: 'Navigation principale' })).toHaveCount(0);
});

test('all 6 nav links are visible after login', async ({ page }) => {
	await login(page, ALICE);
	const nav = page.getByRole('navigation', { name: 'Navigation principale' });
	await expect(nav).toBeVisible();
	for (const { name } of LINKS) {
		const link = nav.getByRole('link', { name, exact: true });
		await expect(link).toBeVisible();
		const box = await link.boundingBox();
		expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
	}
});

for (const { name, path } of LINKS) {
	test(`nav link "${name}" navigates to ${path}`, async ({ page }) => {
		await login(page, ALICE);
		// Start away from the target so the URL change is observable (target may be 404 for now).
		await page.goto(path === '/parametres' ? '/' : '/parametres');
		await page
			.getByRole('navigation', { name: 'Navigation principale' })
			.getByRole('link', { name, exact: true })
			.click();
		// /journal redirects to today's day page.
		const accepted =
			path === '/journal'
				? (url: URL) => /^\/journal(\/\d{4}-\d{2}-\d{2})?$/.test(url.pathname)
				: (url: URL) => url.pathname === path;
		await expect(page).toHaveURL(accepted);
	});
}

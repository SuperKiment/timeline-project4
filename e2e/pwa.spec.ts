import { expect, test } from '@playwright/test';
import { ALICE_STATE } from './helpers';

// The SW is served from the production build (webServer runs `node build`),
// so a classic registration is used; `localhost` counts as a secure context.
test('PWA: public manifest and offline page, offline navigations fall back to it', async ({
	page,
	context,
	playwright,
	baseURL
}) => {
	const anon = await playwright.request.newContext({ baseURL, storageState: undefined });
	const res = await anon.get('/manifest.webmanifest');
	expect(res.status()).toBe(200);
	const manifest = await res.json();
	expect(manifest.id).toBe('/');
	expect(manifest.display).toBe('standalone');
	expect(manifest.lang).toBe('fr');
	expect(manifest.shortcuts.map((s) => s.url)).toEqual(['/entries/new', '/journal']);
	expect(manifest.icons.length).toBeGreaterThanOrEqual(3);
	for (const icon of [...manifest.icons, ...manifest.shortcuts.flatMap((s) => s.icons)]) {
		const iconRes = await anon.get(icon.src);
		expect(iconRes.status()).toBe(200);
		expect(iconRes.headers()['content-type']).toContain('image/png');
	}
	// Static file, served before the auth hook.
	const offline = await anon.get('/offline.html', { maxRedirects: 0 });
	expect(offline.status()).toBe(200);
	await anon.dispose();

	await page.goto('/login');
	const scope = await page.evaluate(async () => {
		const reg = await navigator.serviceWorker.ready;
		return reg.scope;
	});
	expect(scope).toBe(new URL('/', page.url()).href);
	await page.waitForFunction(() => navigator.serviceWorker.controller !== null);

	await context.setOffline(true);
	await page.goto('/journal');
	await expect(page.getByRole('heading', { name: 'Hors ligne' })).toBeVisible();
	await expect(page).toHaveURL(/\/journal$/);
	await context.setOffline(false);
});

test.describe('signed in', () => {
	test.use({ storageState: ALICE_STATE });

	test('settings page tells how to install the app', async ({ page }) => {
		await page.goto('/parametres');
		const section = page.locator('section', {
			has: page.getByRole('heading', { name: 'Application' })
		});
		// Chromium on localhost: secure, not installed; the install event may or may not fire.
		await expect(
			section
				.getByRole('button', { name: "Installer l'application" })
				.or(section.getByText('ouvrez le menu du navigateur'))
		).toBeVisible();
	});
});

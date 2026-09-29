import { expect, test } from '@playwright/test';

// The SW is served from the production build (webServer runs `node build`),
// so a classic registration is used; `localhost` counts as a secure context.
test('PWA: manifest is public and standalone, service worker becomes ready', async ({
	page,
	playwright,
	baseURL
}) => {
	const anon = await playwright.request.newContext({ baseURL, storageState: undefined });
	const res = await anon.get('/manifest.webmanifest');
	expect(res.status()).toBe(200);
	const manifest = await res.json();
	expect(manifest.display).toBe('standalone');
	expect(manifest.lang).toBe('fr');
	expect(manifest.icons.length).toBeGreaterThanOrEqual(3);
	for (const icon of manifest.icons) {
		const iconRes = await anon.get(icon.src);
		expect(iconRes.status()).toBe(200);
		expect(iconRes.headers()['content-type']).toContain('image/png');
	}
	await anon.dispose();

	await page.goto('/login');
	const scope = await page.evaluate(async () => {
		const reg = await navigator.serviceWorker.ready;
		return reg.scope;
	});
	expect(scope).toBe(new URL('/', page.url()).href);
});

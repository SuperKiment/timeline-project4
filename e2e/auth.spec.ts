import { expect, test } from '@playwright/test';
import { ALICE, login } from './helpers';

test('route guard redirects visitors and rejects API and media requests', async ({
	page,
	request
}) => {
	await page.goto('/');
	await expect(page).toHaveURL(/\/login/);

	expect((await request.get('/api/anything')).status()).toBe(401);
	expect((await request.get('/media/1/original')).status()).toBe(401);
});

test('login lifecycle: wrong password fails, correct one logs in, logout clears the session', async ({
	page
}) => {
	await page.goto('/login');
	await page.getByLabel('Identifiant').fill(ALICE.username);
	await page.getByLabel('Mot de passe').fill('mauvais-mot-de-passe');
	await page.getByRole('button', { name: 'Se connecter' }).click();
	await expect(page.getByText('Identifiant ou mot de passe incorrect')).toBeVisible();

	await login(page, ALICE);
	await expect(page).toHaveURL('/');

	await page.goto('/parametres');
	await page.getByRole('button', { name: 'Se déconnecter' }).click();
	await expect(page).toHaveURL(/\/login/);

	await page.goto('/');
	await expect(page).toHaveURL(/\/login/);
});

test('6th rapid failed login for an unknown user shows the rate-limit message', async ({
	page
}) => {
	await page.goto('/login');

	for (let i = 0; i < 6; i++) {
		await page.getByLabel('Identifiant').fill('intrus');
		await page.getByLabel('Mot de passe').fill('mauvais-mot-de-passe');
		await page.getByRole('button', { name: 'Se connecter' }).click();
		await page.waitForLoadState('load');
	}

	await expect(page.getByText('Trop de tentatives, réessayez dans 15 minutes')).toBeVisible();
});

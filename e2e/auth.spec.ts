import { expect, test } from '@playwright/test';
import { ALICE, login } from './helpers';

test('unauthenticated visitor is redirected to /login', async ({ page }) => {
	await page.goto('/');
	await expect(page).toHaveURL(/\/login/);
});

test('unauthenticated API request is rejected', async ({ request }) => {
	const response = await request.get('/api/anything');
	expect(response.status()).toBe(401);
});

test('unauthenticated media request is rejected', async ({ request }) => {
	const response = await request.get('/media/1/original');
	expect(response.status()).toBe(401);
});

test('wrong password shows an error message', async ({ page }) => {
	await page.goto('/login');
	await page.getByLabel('Identifiant').fill(ALICE.username);
	await page.getByLabel('Mot de passe').fill('mauvais-mot-de-passe');
	await page.getByRole('button', { name: 'Se connecter' }).click();

	await expect(page.getByText('Identifiant ou mot de passe incorrect')).toBeVisible();
});

test('correct credentials log in and land on /', async ({ page }) => {
	await login(page, ALICE);

	await expect(page).toHaveURL('/');
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

test('logout clears the session', async ({ page }) => {
	await login(page, ALICE);

	await page.goto('/parametres');
	await page.getByRole('button', { name: 'Se déconnecter' }).click();
	await expect(page).toHaveURL(/\/login/);

	await page.goto('/');
	await expect(page).toHaveURL(/\/login/);
});

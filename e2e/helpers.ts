import type { Page } from '@playwright/test';

export interface TestUser {
	username: string;
	password: string;
}

/** Seeded by `e2e/prepare.sh` (password `motdepasse-test` for both). */
export const ALICE: TestUser = { username: 'alice', password: 'motdepasse-test' };
export const BOB: TestUser = { username: 'bob', password: 'motdepasse-test' };

/** Fills and submits the login form for `user`, waiting for the resulting navigation. */
export async function login(page: Page, user: TestUser): Promise<void> {
	await page.goto('/login');
	await page.getByLabel('Identifiant').fill(user.username);
	await page.getByLabel('Mot de passe').fill(user.password);
	await page.getByRole('button', { name: 'Se connecter' }).click();
	await page.waitForURL((url) => url.pathname !== '/login');
}

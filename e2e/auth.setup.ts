import { test as setup, type Page } from '@playwright/test';
import { ALICE, ALICE_STATE, BOB, BOB_STATE, login, type TestUser } from './helpers';

/**
 * Saves only the session: once hydrated, the home page the login lands on
 * stores the view for this (desktop) screen, which mobile specs must not inherit.
 */
async function saveSession(page: Page, user: TestUser, path: string) {
	await login(page, user);
	await page.waitForFunction(() => document.cookie.includes('timeline_view='));
	await page.context().clearCookies({ name: 'timeline_view' });
	await page.context().storageState({ path });
}

setup('log in alice', async ({ page }) => {
	await saveSession(page, ALICE, ALICE_STATE);
});

setup('log in bob', async ({ page }) => {
	await saveSession(page, BOB, BOB_STATE);
});

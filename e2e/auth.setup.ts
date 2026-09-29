import { test as setup } from '@playwright/test';
import { ALICE, ALICE_STATE, BOB, BOB_STATE, login } from './helpers';

setup('log in alice', async ({ page }) => {
	await login(page, ALICE);
	await page.context().storageState({ path: ALICE_STATE });
});

setup('log in bob', async ({ page }) => {
	await login(page, BOB);
	await page.context().storageState({ path: BOB_STATE });
});

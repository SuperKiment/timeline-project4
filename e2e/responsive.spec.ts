import { expect, test } from '@playwright/test';
import { ALICE_STATE, createEntry, uniqueTitle } from './helpers';

// AC-13: phones down to 375px wide.
test.use({ storageState: ALICE_STATE, viewport: { width: 375, height: 812 } });

test('pages do not overflow horizontally and touch targets are at least 44px', async ({ page }) => {
	const detail = await createEntry(page, { title: uniqueTitle('Responsive') });
	const paths = [
		'/',
		'/journal',
		'/journal/calendrier',
		'/ce-jour-la',
		'/recherche',
		'/corbeille',
		'/parametres',
		'/entries/new',
		detail
	];

	const problems: string[] = [];
	for (const path of paths) {
		await page.goto(path);
		await page.waitForLoadState('networkidle');
		const result = await page.evaluate(() => {
			const small: string[] = [];
			for (const el of document.querySelectorAll<HTMLElement>('button, a[href]')) {
				const r = el.getBoundingClientRect();
				const style = getComputedStyle(el);
				if (r.width === 0 || r.height === 0 || style.visibility === 'hidden') continue;
				if (r.height < 44) {
					const label = (el.innerText || el.getAttribute('aria-label') || '').trim().slice(0, 30);
					small.push(
						`${el.tagName.toLowerCase()}.${el.className} "${label}" h=${Math.round(r.height)}`
					);
				}
			}
			return {
				overflow: document.documentElement.scrollWidth > window.innerWidth,
				small
			};
		});
		if (result.overflow) problems.push(`${path}: horizontal overflow`);
		for (const s of result.small) problems.push(`${path}: ${s}`);
	}
	expect(problems).toEqual([]);
});

import { describe, it, expect, vi } from 'vitest';

vi.mock('$lib/server/db', () => ({ getDb: vi.fn() }));
vi.mock('$lib/server/auth/session', () => ({ validateSession: vi.fn() }));
vi.mock('$lib/server/startup', () => ({ runStartup: vi.fn() }));

import { isPublicPath } from './hooks.server';

describe('isPublicPath', () => {
	it('allows /login and its client-side data request', () => {
		expect(isPublicPath('/login')).toBe(true);
		expect(isPublicPath('/login/__data.json')).toBe(true);
	});
	it('keeps everything else protected (exact match)', () => {
		expect(isPublicPath('/login/foo')).toBe(false);
		expect(isPublicPath('/loginx')).toBe(false);
		expect(isPublicPath('/logout')).toBe(false);
		expect(isPublicPath('/logout/__data.json')).toBe(false);
		expect(isPublicPath('/')).toBe(false);
	});
});

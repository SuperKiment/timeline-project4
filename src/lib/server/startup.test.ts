import { beforeEach, describe, expect, it, vi } from 'vitest';

const runMigrations = vi.fn();

vi.mock('./db', () => ({ getDb: () => ({}) }));
vi.mock('./db/migrate', () => ({ runMigrations: (db: unknown) => runMigrations(db) }));

describe('runStartup', () => {
	beforeEach(() => {
		vi.resetModules();
		runMigrations.mockReset();
	});

	it('retries after a failed migration, then becomes a no-op', async () => {
		const { runStartup } = await import('./startup');
		runMigrations.mockImplementationOnce(() => {
			throw new Error('boom');
		});

		expect(() => runStartup()).toThrow('boom');
		expect(() => runStartup()).not.toThrow();
		runStartup();

		expect(runMigrations).toHaveBeenCalledTimes(2);
	});
});

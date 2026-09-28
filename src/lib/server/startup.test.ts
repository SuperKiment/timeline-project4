import { beforeEach, describe, expect, it, vi } from 'vitest';

const runMigrations = vi.fn();
const purgeExpired = vi.fn();

vi.mock('./db', () => ({ getDb: () => ({}) }));
vi.mock('./db/migrate', () => ({ runMigrations: (db: unknown) => runMigrations(db) }));
vi.mock('./trash/service', () => ({ purgeExpired: (...a: unknown[]) => purgeExpired(...a) }));

describe('runStartup', () => {
	beforeEach(() => {
		vi.resetModules();
		runMigrations.mockReset();
		purgeExpired.mockReset();
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

	it("purges at startup and schedules a single unref'd 24h timer; purge errors are caught", async () => {
		vi.useFakeTimers();
		const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		try {
			purgeExpired.mockRejectedValue(new Error('purge boom'));
			const { runStartup } = await import('./startup');
			runStartup();
			runStartup();
			expect(purgeExpired).toHaveBeenCalledTimes(1);

			await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000);
			expect(purgeExpired).toHaveBeenCalledTimes(2);
			expect(errorSpy).toHaveBeenCalled();
			expect(vi.getTimerCount()).toBe(1);
		} finally {
			vi.clearAllTimers();
			vi.useRealTimers();
			errorSpy.mockRestore();
		}
	});
});

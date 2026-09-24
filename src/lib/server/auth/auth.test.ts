import { describe, expect, it } from 'vitest';
import { createTestDb } from '../db/test-db';
import { LoginRateLimiter } from './rate-limit';
import { hashPassword, verifyPassword } from './password';
import { createSession, invalidateSession, validateSession } from './session';
import { createUser, findUserByUsername } from './users';

describe('hashPassword / verifyPassword', () => {
	it('verifies the right password and rejects a wrong one', async () => {
		const hash = await hashPassword('correct-horse-battery-staple');

		expect(await verifyPassword(hash, 'correct-horse-battery-staple')).toBe(true);
		expect(await verifyPassword(hash, 'wrong-password')).toBe(false);
	});
});

describe('createUser', () => {
	it('creates up to 2 users and refuses a third', async () => {
		const db = createTestDb();
		await createUser(db, { username: 'alice', displayName: 'Alice', password: 'pw' });
		await createUser(db, { username: 'bob', displayName: 'Bob', password: 'pw' });

		await expect(
			createUser(db, { username: 'carol', displayName: 'Carol', password: 'pw' })
		).rejects.toThrow();

		expect(findUserByUsername(db, 'alice')?.username).toBe('alice');
		expect(findUserByUsername(db, 'carol')).toBeNull();
	});

	it('refuses a username that is already taken', async () => {
		const db = createTestDb();
		await createUser(db, { username: 'alice', displayName: 'Alice', password: 'pw' });

		await expect(
			createUser(db, { username: 'alice', displayName: 'Alice bis', password: 'pw2' })
		).rejects.toThrow();
	});
});

describe('sessions', () => {
	it('validates a freshly created session', async () => {
		const db = createTestDb();
		const user = await createUser(db, {
			username: 'alice',
			displayName: 'Alice',
			password: 'secret'
		});

		const now = Date.now();
		const token = createSession(db, user.id, now);
		const validated = validateSession(db, token, now);

		expect(validated?.username).toBe('alice');
	});

	it('returns null for an unknown token', () => {
		const db = createTestDb();

		expect(validateSession(db, 'unknown-token', Date.now())).toBeNull();
	});

	it('returns null for an expired session', async () => {
		const db = createTestDb();
		const user = await createUser(db, {
			username: 'alice',
			displayName: 'Alice',
			password: 'secret'
		});

		const now = Date.now();
		const token = createSession(db, user.id, now);
		const afterExpiry = now + 31 * 24 * 60 * 60 * 1000;

		expect(validateSession(db, token, afterExpiry)).toBeNull();
	});

	it('extends expiry on a sliding basis once less than half the lifetime remains', async () => {
		const db = createTestDb();
		const user = await createUser(db, {
			username: 'alice',
			displayName: 'Alice',
			password: 'secret'
		});

		const start = 0;
		const token = createSession(db, user.id, start);
		const sessionMs = 30 * 24 * 60 * 60 * 1000;

		// Well under half the lifetime remaining: should trigger an extension.
		const nearExpiry = start + sessionMs - 1000;
		expect(validateSession(db, token, nearExpiry)).not.toBeNull();

		// Past the *original* expiry, but still valid because it was extended.
		const pastOriginalExpiry = start + sessionMs + 1000;
		expect(validateSession(db, token, pastOriginalExpiry)).not.toBeNull();
	});

	it('invalidates a session so it can no longer be validated', async () => {
		const db = createTestDb();
		const user = await createUser(db, {
			username: 'alice',
			displayName: 'Alice',
			password: 'secret'
		});

		const now = Date.now();
		const token = createSession(db, user.id, now);
		invalidateSession(db, token);

		expect(validateSession(db, token, now)).toBeNull();
	});
});

describe('LoginRateLimiter', () => {
	it('blocks after 5 failures within the window and unblocks after 15 minutes', () => {
		let now = 0;
		const limiter = new LoginRateLimiter({ now: () => now });
		const key = 'alice|127.0.0.1';

		for (let i = 0; i < 5; i++) {
			expect(limiter.isBlocked(key)).toBe(false);
			limiter.recordFailure(key);
		}
		expect(limiter.isBlocked(key)).toBe(true);

		now += 15 * 60 * 1000;
		expect(limiter.isBlocked(key)).toBe(false);
	});

	it('clears the key on reset, as on a successful login', () => {
		const now = 0;
		const limiter = new LoginRateLimiter({ now: () => now });
		const key = 'bob|127.0.0.1';

		for (let i = 0; i < 5; i++) limiter.recordFailure(key);
		expect(limiter.isBlocked(key)).toBe(true);

		limiter.reset(key);

		expect(limiter.isBlocked(key)).toBe(false);
	});

	it('keeps failure counts independent per key', () => {
		const now = 0;
		const limiter = new LoginRateLimiter({ now: () => now });

		for (let i = 0; i < 5; i++) limiter.recordFailure('alice|127.0.0.1');

		expect(limiter.isBlocked('alice|127.0.0.1')).toBe(true);
		expect(limiter.isBlocked('bob|127.0.0.1')).toBe(false);
	});

	it('sweeps expired keys of other users once the window elapses', () => {
		let now = 0;
		const limiter = new LoginRateLimiter({ now: () => now });

		limiter.recordFailure('alice|127.0.0.1');
		limiter.recordFailure('carol|127.0.0.1');
		expect(limiter.size).toBe(2);

		now += 15 * 60 * 1000;
		limiter.recordFailure('bob|127.0.0.1');

		// alice and carol were swept away; only bob remains.
		expect(limiter.size).toBe(1);
	});

	it('evicts oldest-inserted, non-blocked keys once the map exceeds maxKeys', () => {
		const now = 0;
		const limiter = new LoginRateLimiter({ now: () => now, maxKeys: 3 });

		limiter.recordFailure('a|127.0.0.1');
		limiter.recordFailure('b|127.0.0.1');
		limiter.recordFailure('c|127.0.0.1');
		limiter.recordFailure('d|127.0.0.1');

		expect(limiter.size).toBe(3);
	});

	it('keeps a blocked key blocked through a flood of fresh keys past maxKeys', () => {
		const now = 0;
		const maxKeys = 3;
		const limiter = new LoginRateLimiter({ now: () => now, maxKeys });
		const blockedKey = 'blocked|127.0.0.1';

		for (let i = 0; i < 5; i++) limiter.recordFailure(blockedKey);
		expect(limiter.isBlocked(blockedKey)).toBe(true);

		// Flood well past maxKeys with fresh, non-blocked keys.
		for (let i = 0; i < maxKeys + 5; i++) {
			limiter.recordFailure(`flood-${i}|127.0.0.1`);
		}

		expect(limiter.isBlocked(blockedKey)).toBe(true);
		expect(limiter.size).toBe(maxKeys);
	});
});

import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';
import { getConfig } from '../config';
import type { Db } from '../db';
import { sessions, users } from '../db/schema';

export interface SessionUser {
	id: number;
	username: string;
	displayName: string;
}

/** Raw token length in bytes (Conventions: random 32-byte token). */
const TOKEN_BYTES = 32;

function hashToken(token: string): string {
	return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Creates a session for `userId` and returns the raw token to store in the
 * `session` cookie. Only the SHA-256 hash of the token is persisted
 * (Conventions).
 */
export function createSession(db: Db, userId: number, now = Date.now()): string {
	const token = crypto.randomBytes(TOKEN_BYTES).toString('hex');
	const sessionMs = getConfig().sessionDays * 24 * 60 * 60 * 1000;
	db.insert(sessions)
		.values({ id: hashToken(token), userId, expiresAt: now + sessionMs })
		.run();
	return token;
}

/**
 * Validates a raw session token: returns the associated user, or null if
 * the token is unknown or expired. Implements the sliding expiry by
 * extending `expiresAt` by a full session lifetime whenever less than half
 * of it remains (Conventions: 30-day sliding expiry).
 */
export function validateSession(db: Db, token: string, now = Date.now()): SessionUser | null {
	const id = hashToken(token);
	const row = db
		.select({
			expiresAt: sessions.expiresAt,
			userId: users.id,
			username: users.username,
			displayName: users.displayName
		})
		.from(sessions)
		.innerJoin(users, eq(sessions.userId, users.id))
		.where(eq(sessions.id, id))
		.get();

	if (!row || row.expiresAt <= now) return null;

	const sessionMs = getConfig().sessionDays * 24 * 60 * 60 * 1000;
	if (row.expiresAt - now < sessionMs / 2) {
		db.update(sessions)
			.set({ expiresAt: now + sessionMs })
			.where(eq(sessions.id, id))
			.run();
	}

	return { id: row.userId, username: row.username, displayName: row.displayName };
}

/** Deletes a session by its raw token (logout). No-op if it doesn't exist. */
export function invalidateSession(db: Db, token: string): void {
	db.delete(sessions)
		.where(eq(sessions.id, hashToken(token)))
		.run();
}

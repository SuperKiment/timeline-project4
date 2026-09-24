import { eq } from 'drizzle-orm';
import type { Db } from '../db';
import { users } from '../db/schema';
import { hashPassword } from './password';

export interface UserRecord {
	id: number;
	username: string;
	displayName: string;
	passwordHash: string;
	createdAt: number;
}

export interface CreateUserInput {
	username: string;
	displayName: string;
	password: string;
}

/** Hard cap on user accounts (Conventions: non-goal to support >2 users). */
const MAX_USERS = 2;

/**
 * Creates a user account. Refuses (throwing with a French message) when the
 * 2-account cap is already reached or the username is already taken.
 */
export async function createUser(
	db: Db,
	input: CreateUserInput,
	now = Date.now()
): Promise<UserRecord> {
	const existingCount = db.select({ id: users.id }).from(users).all().length;
	if (existingCount >= MAX_USERS) {
		throw new Error('Nombre maximum de comptes atteint (2)');
	}
	if (findUserByUsername(db, input.username)) {
		throw new Error('Ce nom d’utilisateur est déjà utilisé');
	}

	const passwordHash = await hashPassword(input.password);
	return db
		.insert(users)
		.values({
			username: input.username,
			displayName: input.displayName,
			passwordHash,
			createdAt: now
		})
		.returning()
		.get();
}

/** Finds a user by exact username match, or null if none exists. */
export function findUserByUsername(db: Db, username: string): UserRecord | null {
	return db.select().from(users).where(eq(users.username, username)).get() ?? null;
}

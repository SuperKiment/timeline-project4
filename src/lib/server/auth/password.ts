import { hash, verify } from '@node-rs/argon2';

/** Hashes a plaintext password with argon2id (library defaults). */
export function hashPassword(password: string): Promise<string> {
	return hash(password);
}

/** Verifies a plaintext password against a stored argon2 hash. */
export function verifyPassword(passwordHash: string, password: string): Promise<boolean> {
	return verify(passwordHash, password);
}

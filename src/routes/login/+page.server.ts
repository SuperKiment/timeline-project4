import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { getConfig } from '$lib/server/config';
import { getDb } from '$lib/server/db';
import { hashPassword, verifyPassword } from '$lib/server/auth/password';
import { loginRateLimiter } from '$lib/server/auth/rate-limit';
import { safeRedirectTarget } from '$lib/server/auth/redirect';
import { createSession } from '$lib/server/auth/session';
import { findUserByUsername } from '$lib/server/auth/users';

/**
 * Fixed hash verified against unknown usernames so failed-login response
 * timing does not reveal whether an account exists (B4 security review).
 * Computed lazily once per process — the plaintext is never a real
 * password.
 */
let dummyHashPromise: Promise<string> | null = null;
function getDummyHash(): Promise<string> {
	if (!dummyHashPromise) {
		dummyHashPromise = hashPassword('dummy-password-never-used-for-a-real-account');
	}
	return dummyHashPromise;
}

export const load: PageServerLoad = ({ locals, url }) => {
	const redirectTo = safeRedirectTarget(url.searchParams.get('redirectTo'));

	if (locals.user) {
		redirect(303, redirectTo ?? '/');
	}

	return { redirectTo };
};

export const actions: Actions = {
	default: async ({ request, cookies, getClientAddress, url }) => {
		const data = await request.formData();
		const usernameRaw = String(data.get('username') ?? '');
		const password = String(data.get('password') ?? '');
		const redirectTo = safeRedirectTarget(String(data.get('redirectTo') ?? ''));

		// B4 security review: lowercase consistently for both lookup and the
		// rate-limit key.
		const username = usernameRaw.trim().toLowerCase();
		const key = `${username}|${getClientAddress()}`;

		if (loginRateLimiter.isBlocked(key)) {
			return fail(429, {
				username: usernameRaw,
				error: 'Trop de tentatives, réessayez dans 15 minutes'
			});
		}

		const db = getDb();
		const user = findUserByUsername(db, username);

		let ok = false;
		if (user) {
			ok = await verifyPassword(user.passwordHash, password);
		} else {
			// Dummy verify so timing doesn't leak whether the account exists.
			await verifyPassword(await getDummyHash(), password);
		}

		if (!user || !ok) {
			loginRateLimiter.recordFailure(key);
			return fail(400, {
				username: usernameRaw,
				error: 'Identifiant ou mot de passe incorrect'
			});
		}

		loginRateLimiter.reset(key);

		const token = createSession(db, user.id);
		cookies.set('session', token, {
			path: '/',
			httpOnly: true,
			sameSite: 'lax',
			secure: url.protocol === 'https:',
			maxAge: getConfig().sessionDays * 24 * 60 * 60
		});

		redirect(303, redirectTo ?? '/');
	}
};

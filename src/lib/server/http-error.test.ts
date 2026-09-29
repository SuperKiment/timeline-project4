import { describe, expect, it } from 'vitest';
import { HttpError, parseIdParam, rethrowAsKitError } from './http-error';

describe('parseIdParam', () => {
	it('parses positive integers', () => {
		expect(parseIdParam('1')).toBe(1);
		expect(parseIdParam('42')).toBe(42);
	});

	it.each([undefined, '', '0', '-1', '1.5', '1e3', 'abc', '12abc', ' 1', '99999999999999999999'])(
		'rejects %j with a 400',
		(raw) => {
			expect(() => parseIdParam(raw)).toThrow(HttpError);
			try {
				parseIdParam(raw);
			} catch (err) {
				expect((err as HttpError).status).toBe(400);
				expect((err as HttpError).message).toBe('Identifiant invalide.');
			}
		}
	);
});

describe('rethrowAsKitError', () => {
	it('maps HttpError to a SvelteKit error with the same status and message', () => {
		try {
			rethrowAsKitError(new HttpError(404, 'Introuvable.'));
			expect.unreachable();
		} catch (err) {
			expect(err).toMatchObject({ status: 404, body: { message: 'Introuvable.' } });
		}
	});

	it('rethrows other errors untouched', () => {
		const boom = new Error('boom');
		expect(() => rethrowAsKitError(boom)).toThrow(boom);
	});
});

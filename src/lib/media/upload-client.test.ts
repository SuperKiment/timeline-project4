import { describe, expect, it } from 'vitest';
import { GENERIC_UPLOAD_ERROR, extractErrorMessage, loginRedirectUrl } from './upload-client';

describe('extractErrorMessage', () => {
	it('returns the server message', () => {
		expect(extractErrorMessage('{"message":"Fichier trop volumineux (max 500 Mo)"}')).toBe(
			'Fichier trop volumineux (max 500 Mo)'
		);
	});

	it('falls back on non-JSON or missing message', () => {
		expect(extractErrorMessage('<html>')).toBe(GENERIC_UPLOAD_ERROR);
		expect(extractErrorMessage('{"foo":1}')).toBe(GENERIC_UPLOAD_ERROR);
		expect(extractErrorMessage('{"message":""}')).toBe(GENERIC_UPLOAD_ERROR);
		expect(extractErrorMessage('null')).toBe(GENERIC_UPLOAD_ERROR);
	});

	it('uses a custom fallback when given', () => {
		expect(extractErrorMessage('<html>', 'Suppression impossible.')).toBe(
			'Suppression impossible.'
		);
		expect(extractErrorMessage('{"message":"Non"}', 'X')).toBe('Non');
	});
});

describe('loginRedirectUrl', () => {
	it('encodes path and query', () => {
		expect(loginRedirectUrl('/entries/1', '?a=b')).toBe('/login?redirectTo=%2Fentries%2F1%3Fa%3Db');
	});
});

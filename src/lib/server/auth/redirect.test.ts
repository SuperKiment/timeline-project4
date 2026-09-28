import { describe, expect, it } from 'vitest';
import { safeRedirectTarget } from './redirect';

describe('safeRedirectTarget', () => {
	it('accepts same-origin relative paths', () => {
		expect(safeRedirectTarget('/')).toBe('/');
		expect(safeRedirectTarget('/entries/3?x=1#a')).toBe('/entries/3?x=1#a');
	});

	it('keeps an encoded backslash on the same origin', () => {
		const result = safeRedirectTarget('/%5Cevil.com');
		expect(result).not.toBeNull();
		expect(new URL(result!, 'http://x').origin).toBe('http://x');
	});

	it.each([
		['null', null],
		['undefined', undefined],
		['empty', ''],
		['bare host', 'evil.com'],
		['protocol-relative', '//evil.com'],
		['backslash after slash', '/\\evil.com'],
		['double backslash', '/\\\\evil.com'],
		['absolute url', 'http://evil.com'],
		['tab in path', '/\t/evil.com'],
		['newline in path', '/\n/evil.com'],
		['carriage return in path', '/\r/evil.com'],
		['backslash later in path', '/a\\b'],
		['javascript scheme', 'javascript:alert(1)']
	])('rejects %s', (_label, input) => {
		expect(safeRedirectTarget(input)).toBeNull();
	});
});

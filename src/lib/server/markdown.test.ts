import { describe, expect, it } from 'vitest';
import { renderMarkdown } from './markdown';

describe('renderMarkdown', () => {
	it('renders basic markdown to HTML', () => {
		expect(renderMarkdown('**a**')).toContain('<strong>a</strong>');
	});

	it('strips <script> tags entirely', () => {
		const out = renderMarkdown('<script>alert(1)</script>');
		expect(out).not.toContain('<script');
		expect(out).not.toContain('script>');
	});

	it('strips onerror handlers from raw img tags', () => {
		const out = renderMarkdown('<img src=x onerror=alert(1)>');
		expect(out).not.toContain('onerror');
	});

	it('strips javascript: URLs from links', () => {
		const out = renderMarkdown('[x](javascript:alert(1))');
		expect(out).not.toContain('javascript:');
	});

	it('forces rel="noopener noreferrer" on links', () => {
		const out = renderMarkdown('[x](https://example.com)');
		expect(out).toContain('rel="noopener noreferrer"');
	});

	it('allows only http, https and mailto link schemes', () => {
		const httpOut = renderMarkdown('[x](http://example.com)');
		expect(httpOut).toContain('href="http://example.com"');

		const mailtoOut = renderMarkdown('[x](mailto:a@b.com)');
		expect(mailtoOut).toContain('href="mailto:a@b.com"');

		const ftpOut = renderMarkdown('[x](ftp://example.com)');
		expect(ftpOut).not.toContain('href=');
	});

	it('keeps allowlisted structural tags', () => {
		const out = renderMarkdown('### heading\n\n- one\n- two\n\n> quote\n\n`code`');
		expect(out).toContain('<h3>');
		expect(out).toContain('<ul>');
		expect(out).toContain('<li>');
		expect(out).toContain('<blockquote>');
		expect(out).toContain('<code>');
	});

	it('drops h1/h2 headings from the allowlist while keeping their text', () => {
		const out = renderMarkdown('# top\n\n## sub');
		expect(out).not.toContain('<h1>');
		expect(out).not.toContain('<h2>');
		expect(out).toContain('top');
		expect(out).toContain('sub');
	});

	it('strips protocol-relative URLs from links', () => {
		const out = renderMarkdown('[x](//evil.com)');
		expect(out).not.toContain('href=');
	});

	it('keeps target="_blank" on links', () => {
		const out = renderMarkdown('<a href="https://example.com" target="_blank">x</a>');
		expect(out).toContain('target="_blank"');
	});

	it('removes any target other than "_blank" from links', () => {
		const out = renderMarkdown('<a href="https://example.com" target="_top">x</a>');
		expect(out).not.toContain('target=');
	});
});

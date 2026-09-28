const PLACEHOLDER_ORIGIN = 'http://x';

function hasBackslashOrControlChar(value: string): boolean {
	for (let i = 0; i < value.length; i++) {
		const code = value.charCodeAt(i);
		if (code === 0x5c || code <= 0x1f || code === 0x7f) return true;
	}
	return false;
}

/**
 * Only relative, same-origin paths are accepted as a post-login redirect
 * target. Browsers normalise `\` to `/` and strip tab/newline characters, so
 * `/\evil.com` or `/\t/evil.com` would become protocol-relative URLs; both
 * are rejected. Returns the normalised `pathname + search + hash`, or null.
 */
export function safeRedirectTarget(path: string | null | undefined): string | null {
	if (!path || !/^\/(?![/\\])/.test(path) || hasBackslashOrControlChar(path)) {
		return null;
	}

	let url: URL;
	try {
		url = new URL(path, PLACEHOLDER_ORIGIN);
	} catch {
		return null;
	}
	if (url.origin !== PLACEHOLDER_ORIGIN) return null;

	return url.pathname + url.search + url.hash;
}

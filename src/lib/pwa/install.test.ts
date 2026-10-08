import { describe, expect, it } from 'vitest';
import { installState, isAppleMobile, type InstallEnv } from './install';

const base: InstallEnv = { installed: false, secure: true, canPrompt: false, ios: false };

describe('installState', () => {
	it('follows the priority installed > insecure > prompt > ios > menu', () => {
		const all = { installed: true, secure: false, canPrompt: true, ios: true };
		expect(installState(all)).toBe('installed');
		expect(installState({ ...all, installed: false })).toBe('insecure');
		expect(installState({ ...all, installed: false, secure: true })).toBe('prompt');
		expect(installState({ ...base, ios: true })).toBe('ios');
		expect(installState(base)).toBe('menu');
	});
});

describe('isAppleMobile', () => {
	const iphone =
		'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
	const mac =
		'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15';
	const android =
		'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';

	it('detects iPhone, and iPadOS behind its desktop user agent', () => {
		expect(isAppleMobile(iphone, 5)).toBe(true);
		expect(isAppleMobile(mac, 5)).toBe(true);
	});

	it('leaves out real Macs and Android', () => {
		expect(isAppleMobile(mac, 0)).toBe(false);
		expect(isAppleMobile(android, 5)).toBe(false);
	});
});

/**
 * What the settings page can tell the user about installing the app, in
 * priority order: already installed, blocked by an insecure origin (service
 * workers need HTTPS outside localhost), a captured `beforeinstallprompt`,
 * the iOS share sheet (no install prompt in WebKit), else the browser menu.
 */
export type InstallState = 'installed' | 'insecure' | 'prompt' | 'ios' | 'menu';

export interface InstallEnv {
	/** Running as the installed app, or `appinstalled` fired in this tab. */
	installed: boolean;
	secure: boolean;
	canPrompt: boolean;
	ios: boolean;
}

export function installState(env: InstallEnv): InstallState {
	if (env.installed) return 'installed';
	if (!env.secure) return 'insecure';
	if (env.canPrompt) return 'prompt';
	if (env.ios) return 'ios';
	return 'menu';
}

/**
 * iPhone/iPad, every browser there being WebKit. iPadOS reports a desktop
 * Mac user agent by default, told apart from a real Mac by its touch points.
 */
export function isAppleMobile(userAgent: string, maxTouchPoints: number): boolean {
	return /iPhone|iPad|iPod/.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1);
}

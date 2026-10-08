import { browser } from '$app/environment';

/** Chromium-only event, missing from the DOM lib. */
interface BeforeInstallPromptEvent extends Event {
	prompt(): Promise<void>;
	readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

let deferred = $state<BeforeInstallPromptEvent | null>(null);
let installed = $state(false);
let prompting = false;

// `beforeinstallprompt` fires once per page load, possibly before the settings
// page is mounted: listen as soon as this module loads (the root layout imports it).
if (browser) {
	window.addEventListener('beforeinstallprompt', (event) => {
		// Keeps the event for our own button (and drops Chrome's install banner).
		event.preventDefault();
		deferred = event as BeforeInstallPromptEvent;
	});
	window.addEventListener('appinstalled', () => {
		deferred = null;
		installed = true;
	});
}

export const installPrompt = {
	/** A captured `beforeinstallprompt` is waiting for `prompt()`. */
	get available(): boolean {
		return deferred !== null;
	},
	/** Installed from this tab (`appinstalled` or an accepted prompt). */
	get installed(): boolean {
		return installed;
	},
	/** Shows the browser's install dialog. The event is single-use, whatever the outcome. */
	async prompt(): Promise<void> {
		const event = deferred;
		if (!event || prompting) return;
		prompting = true;
		try {
			await event.prompt();
			if ((await event.userChoice).outcome === 'accepted') installed = true;
		} finally {
			deferred = null;
			prompting = false;
		}
	}
};

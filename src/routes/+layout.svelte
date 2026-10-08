<script lang="ts">
	import '@fontsource-variable/newsreader';
	// Same file as the Latin @font-face of the import above: Vite emits one hashed asset.
	import newsreaderLatin from '@fontsource-variable/newsreader/files/newsreader-latin-wght-normal.woff2?url';
	import '../app.css';
	import AppNav from '$lib/components/AppNav.svelte';
	// Side effect: captures `beforeinstallprompt` before any page needs it.
	import '$lib/pwa/install-prompt.svelte';

	let { data, children } = $props();
</script>

<svelte:head>
	<link rel="preload" as="font" type="font/woff2" href={newsreaderLatin} crossorigin="anonymous" />
</svelte:head>

{#if data.user}
	<AppNav />
{/if}

<div class="app-content" class:with-nav={data.user}>
	{@render children()}
</div>

<style>
	/* Room for the floating bottom nav (mobile), top bar is in normal flow (desktop). */
	.app-content.with-nav {
		padding-bottom: calc(96px + env(safe-area-inset-bottom, 0px));
	}

	@media (min-width: 1024px) {
		.app-content.with-nav {
			padding-bottom: 0;
		}
	}
</style>

<script lang="ts">
	import '@fontsource-variable/newsreader';
	import '../app.css';
	import AppNav from '$lib/components/AppNav.svelte';
	// Side effect: captures `beforeinstallprompt` before any page needs it.
	import '$lib/pwa/install-prompt.svelte';

	let { data, children } = $props();
</script>

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

<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import HorizontalTimeline from '$lib/components/timeline/HorizontalTimeline.svelte';
	import TypeFilters from '$lib/components/timeline/TypeFilters.svelte';
	import VerticalTimeline from '$lib/components/timeline/VerticalTimeline.svelte';
	import ViewToggle from '$lib/components/timeline/ViewToggle.svelte';
	import { initialView, viewCookie, type TimelineView } from '$lib/timeline/prefs';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// The server renders the cookie's view. Without a cookie it renders the
	// vertical (mobile) one and the browser picks the real one once, on mount.
	let chosen = $state<TimelineView | null>(null);
	const view = $derived(chosen ?? data.view ?? 'vertical');
	// The toggle does nothing before hydration: flagged (aria-)disabled until
	// then, without the dimmed `:disabled` look flashing on every load.
	let hydrated = $state(false);

	onMount(() => {
		if (!data.view) {
			chooseView(
				initialView(
					() => localStorage,
					(query) => window.matchMedia(query)
				)
			);
		}
		hydrated = true;
	});

	function chooseView(next: TimelineView) {
		chosen = next;
		document.cookie = viewCookie(next);
	}
</script>

<svelte:head>
	<title>Notre timeline</title>
</svelte:head>

<main class="page home">
	<header class="top">
		<h1>Notre timeline</h1>
		<a class="btn this-day" href={resolve('/ce-jour-la')}>Ce jour-là</a>
	</header>

	{#if data.isEmpty}
		<section class="empty" aria-labelledby="empty-title">
			<h2 id="empty-title">Votre timeline est vide</h2>
			<p>Commencez par ajouter votre premier souvenir.</p>
			<a class="btn btn-primary" href={resolve('/entries/new')}>Ajouter un souvenir</a>
		</section>
	{:else}
		<div class="controls">
			<TypeFilters selected={data.types} />
			<ViewToggle {view} disabled={!hydrated} onchange={chooseView} />
		</div>

		{#if data.items.length === 0}
			<p class="no-match">Aucun élément pour ces filtres.</p>
		{:else if view === 'horizontal'}
			<HorizontalTimeline items={data.items} today={data.today} />
		{:else}
			<VerticalTimeline items={data.items} today={data.today} />
		{/if}
	{/if}

	<a class="btn btn-primary fab" href={resolve('/entries/new')}
		><span aria-hidden="true">+</span> Ajouter</a
	>
</main>

<style>
	.top {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		margin-block-end: 1rem;
	}

	.top h1 {
		margin: 0;
	}

	.controls {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		margin: 1.25rem 0;
	}

	.empty {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.5rem;
		padding: 3rem 1rem;
		text-align: center;
	}

	.empty h2,
	.empty p {
		margin: 0;
	}

	.empty p,
	.no-match {
		color: var(--color-text-muted);
	}

	/* Mobile: above the floating nav (64px + 12px offset) with a 12px gap, plus breathing room. */
	.fab {
		position: fixed;
		right: 16px;
		bottom: calc(64px + 12px + 12px + 12px + env(safe-area-inset-bottom, 0px));
		z-index: 40;
		min-width: 44px;
		box-shadow: var(--shadow-float);
	}

	@media (min-width: 1024px) {
		.fab {
			right: 24px;
			bottom: 24px;
		}
	}
</style>

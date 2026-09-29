<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import HorizontalTimeline from '$lib/components/timeline/HorizontalTimeline.svelte';
	import TypeFilters from '$lib/components/timeline/TypeFilters.svelte';
	import VerticalTimeline from '$lib/components/timeline/VerticalTimeline.svelte';
	import ViewToggle from '$lib/components/timeline/ViewToggle.svelte';
	import { loadView, saveView, type TimelineView } from '$lib/timeline/prefs';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// `null` until mounted: the saved/default view is only known in the browser,
	// so nothing view-specific is rendered before that (no wrong-layout flash).
	let view = $state<TimelineView | null>(null);

	onMount(() => {
		view = loadView(
			() => localStorage,
			(query) => window.matchMedia(query)
		);
	});

	function chooseView(next: TimelineView) {
		view = next;
		saveView(next, () => localStorage);
	}
</script>

<svelte:head>
	<title>Notre timeline</title>
</svelte:head>

<main class="home">
	<header class="top">
		<h1>Notre timeline</h1>
		<a class="btn this-day" href={resolve('/ce-jour-la')}>Ce jour-là</a>
	</header>

	{#if data.isEmpty}
		<section class="empty" aria-labelledby="empty-title">
			<h2 id="empty-title">Votre timeline est vide</h2>
			<p>Commencez par ajouter votre premier souvenir.</p>
			<a class="btn primary" href={resolve('/entries/new')}>Ajouter un souvenir</a>
		</section>
	{:else}
		<div class="controls">
			<TypeFilters selected={data.types} />
			{#if view}
				<ViewToggle {view} onchange={chooseView} />
			{/if}
		</div>

		{#if data.items.length === 0}
			<p class="no-match">Aucun élément pour ces filtres.</p>
		{:else if view === 'horizontal'}
			<HorizontalTimeline items={data.items} today={data.today} />
		{:else if view === 'vertical'}
			<VerticalTimeline items={data.items} today={data.today} />
		{/if}
	{/if}

	<a class="btn fab" href={resolve('/entries/new')}><span aria-hidden="true">+</span> Ajouter</a>
</main>

<style>
	.home {
		padding: 1rem;
	}

	.top {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
	}

	h1 {
		margin: 0;
		font-size: 1.5rem;
	}

	.btn {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 0.375rem;
		padding: 0 1rem;
		border: 1px solid var(--color-border);
		border-radius: 0.5rem;
		text-decoration: none;
	}

	.btn.primary,
	.btn.fab {
		background: var(--color-accent);
		border-color: var(--color-accent);
		color: var(--color-accent-contrast);
		font-weight: 600;
	}

	.controls {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 0.75rem;
		margin: 1rem 0;
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

	.no-match {
		color: var(--color-text-muted);
	}

	/* Above the fixed mobile bottom nav (~64px + safe area). */
	.fab {
		position: fixed;
		right: 1rem;
		bottom: calc(64px + env(safe-area-inset-bottom, 0px) + 1rem);
		z-index: 40;
		min-width: 44px;
		min-height: 48px;
		border-radius: 999px;
		box-shadow: 0 2px 8px rgb(0 0 0 / 0.3);
	}

	@media (min-width: 1024px) {
		.fab {
			bottom: 1.5rem;
		}
	}
</style>

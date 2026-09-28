<script lang="ts">
	import { formatItemDateRange, itemHref } from '../../timeline/layout';
	import type { TimelineItem } from '../../timeline/types';

	let { item }: { item: TimelineItem } = $props();
</script>

<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- target routes (/entries/[id], /entries/[id]/occurrences/[date]) are added by T29/T30, not yet present for resolve() to type-check -->
<a class="card" class:important={item.type === 'important'} href={itemHref(item)}>
	{#if item.thumbUrl}
		<img
			class="thumb"
			src={item.thumbUrl}
			alt=""
			loading="lazy"
			decoding="async"
			width="56"
			height="56"
		/>
	{/if}
	<div class="body">
		<p class="date">{formatItemDateRange(item)}</p>
		<h3 class="title">{item.title}</h3>
		{#if item.location}
			<p class="location">{item.location}</p>
		{/if}
		{#if item.kind === 'occurrence' && item.hasNote}
			<span class="note-badge">Note</span>
		{/if}
	</div>
</a>

<style>
	.card {
		display: flex;
		gap: 0.75rem;
		padding: 0.5rem;
		border-radius: 0.5rem;
		text-decoration: none;
		color: var(--color-text);
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-left: 3px solid transparent;
	}

	.card.important {
		border-left-color: var(--color-important);
	}

	.thumb {
		flex: none;
		width: 56px;
		height: 56px;
		object-fit: cover;
		border-radius: 0.375rem;
		background: var(--color-border);
	}

	.body {
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
	}

	.date {
		margin: 0;
		font-size: 0.8125rem;
		color: var(--color-text-muted);
	}

	.title {
		margin: 0;
		font-size: 1rem;
		font-weight: 600;
		overflow-wrap: anywhere;
	}

	.location {
		margin: 0;
		font-size: 0.8125rem;
		color: var(--color-text-muted);
	}

	.note-badge {
		align-self: flex-start;
		font-size: 0.75rem;
		color: var(--color-accent);
	}
</style>

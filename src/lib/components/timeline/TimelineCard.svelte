<script lang="ts">
	import { formatItemDateRange, itemHref } from '../../timeline/layout';
	import type { TimelineItem } from '../../timeline/types';

	let { item }: { item: TimelineItem } = $props();
</script>

<!-- eslint-disable svelte/no-navigation-without-resolve -- itemHref() already returns a resolve()d path -->
<a
	href={itemHref(item)}
	class="card"
	class:important={item.type === 'important'}
	class:histoire={item.type === 'histoire'}
>
	<!-- eslint-enable svelte/no-navigation-without-resolve -->
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
		position: relative;
		display: flex;
		gap: 0.75rem;
		padding: 0.875rem 1rem;
		overflow: hidden;
		border-radius: var(--radius-lg);
		text-decoration: none;
		color: var(--color-text);
		background: var(--surface);
		border: 1px solid var(--glass-border);
		box-shadow: var(--shadow-pane);
	}

	/* Important: a visible inner bar on the leading edge. */
	.card.important::before {
		content: '';
		position: absolute;
		inset: 0 auto 0 0;
		width: 4px;
		background: var(--color-important);
	}

	/* Histoire (grey track): quieter, flat. */
	.card.histoire {
		background: color-mix(in srgb, var(--surface) 55%, transparent);
		box-shadow: none;
	}

	.thumb {
		flex: none;
		width: 56px;
		height: 56px;
		object-fit: cover;
		border-radius: var(--radius-sm);
		background: var(--hairline);
	}

	.body {
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
	}

	.date,
	.location {
		margin: 0;
		font-size: 0.8125rem;
		color: var(--color-text-muted);
	}

	.title {
		margin: 0;
		font-family: var(--font-serif);
		font-size: 1.125rem;
		font-weight: 600;
		line-height: 1.3;
		overflow-wrap: anywhere;
	}

	.note-badge {
		align-self: flex-start;
		padding: 0 0.5rem;
		border-radius: var(--radius-pill);
		background: var(--color-accent-soft);
		font-size: 0.75rem;
		font-weight: 600;
		color: var(--color-accent);
	}
</style>

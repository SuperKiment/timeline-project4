<script lang="ts">
	import { resolve } from '$app/paths';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>Ce jour-là — Notre timeline</title>
</svelte:head>

<div class="page-narrow">
	<h1>Ce jour-là — {data.dayLabel}</h1>

	{#if data.years.length === 0}
		<p class="empty">
			Rien ne s'est passé un {data.dayLabel} les années précédentes… pour l'instant.
		</p>
	{:else}
		{#each data.years as group (group.year)}
			<section>
				<h2>{group.label}</h2>
				<ul>
					{#each group.items as item (item.kind === 'entry' ? `e${item.id}` : item.kind === 'occurrence' ? `o${item.seriesId}|${item.date}` : `j${item.day}|${item.author}`)}
						<li>
							{#if item.kind === 'entry'}
								<a
									class="card pane"
									class:important={item.type === 'important'}
									href={resolve('/entries/[id]', { id: String(item.id) })}
								>
									<span class="meta">{item.type === 'important' ? 'Important' : 'Souvenir'}</span>
									<span class="title">{item.title}</span>
								</a>
							{:else if item.kind === 'occurrence'}
								<a
									class="card pane"
									href={resolve('/entries/[id]/occurrences/[date]', {
										id: String(item.seriesId),
										date: item.date
									})}
								>
									<span class="meta">Récurrent</span>
									<span class="title">{item.title}</span>
									{#if item.note}<span class="excerpt">{item.note}</span>{/if}
								</a>
							{:else}
								<a class="card pane" href={resolve('/journal/[date]', { date: item.day })}>
									<span class="meta">Journal — {item.author}</span>
									<span class="excerpt">{item.excerpt}</span>
								</a>
							{/if}
						</li>
					{/each}
				</ul>
			</section>
		{/each}
	{/if}
</div>

<style>
	h2 {
		margin: 2rem 0 0.75rem;
	}

	ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.empty {
		margin-top: 1.5rem;
		color: var(--color-text-muted);
	}

	.card {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		border-left: 3px solid transparent;
		text-decoration: none;
		color: var(--color-text);
	}

	.card.important {
		border-left-color: var(--color-important);
	}

	.meta {
		font-size: 0.8125rem;
		color: var(--color-text-muted);
	}

	.title {
		font-family: var(--font-serif);
		font-size: 1.125rem;
		font-weight: 600;
		overflow-wrap: anywhere;
	}

	.excerpt {
		font-size: 0.9375rem;
		color: var(--color-text-muted);
		overflow-wrap: anywhere;
	}
</style>

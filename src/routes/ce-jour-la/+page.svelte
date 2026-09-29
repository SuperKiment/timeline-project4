<script lang="ts">
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>Ce jour-là — Notre timeline</title>
</svelte:head>

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
				<!-- eslint-disable svelte/no-navigation-without-resolve -- target routes (/entries/[id], /entries/[id]/occurrences/[date], /journal/[date]) are added by T29/T30/T34, not yet present for resolve() to type-check -->
				{#each group.items as item (item.kind === 'entry' ? `e${item.id}` : item.kind === 'occurrence' ? `o${item.seriesId}|${item.date}` : `j${item.day}|${item.author}`)}
					<li>
						{#if item.kind === 'entry'}
							<a class="card" class:important={item.type === 'important'} href="/entries/{item.id}">
								<span class="kind">{item.type === 'important' ? 'Important' : 'Souvenir'}</span>
								<span class="title">{item.title}</span>
							</a>
						{:else if item.kind === 'occurrence'}
							<a class="card" href="/entries/{item.seriesId}/occurrences/{item.date}">
								<span class="kind">Récurrent</span>
								<span class="title">{item.title}</span>
								{#if item.note}<span class="excerpt">{item.note}</span>{/if}
							</a>
						{:else}
							<a class="card" href="/journal/{item.day}">
								<span class="kind">Journal — {item.author}</span>
								<span class="excerpt">{item.excerpt}</span>
							</a>
						{/if}
					</li>
				{/each}
				<!-- eslint-enable svelte/no-navigation-without-resolve -->
			</ul>
		</section>
	{/each}
{/if}

<style>
	h2 {
		font-size: 1.125rem;
		margin: 1.5rem 0 0.5rem;
	}

	ul {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.empty {
		color: var(--color-text-muted);
	}

	.card {
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
		padding: 0.5rem 0.75rem;
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

	.kind {
		font-size: 0.8125rem;
		color: var(--color-text-muted);
	}

	.title {
		font-weight: 600;
		overflow-wrap: anywhere;
	}

	.excerpt {
		font-size: 0.875rem;
		color: var(--color-text-muted);
		overflow-wrap: anywhere;
	}
</style>

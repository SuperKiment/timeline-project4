<script lang="ts">
	import { resolve } from '$app/paths';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>Recherche — Notre timeline</title>
</svelte:head>

<div class="page-narrow">
	<h1>Recherche</h1>

	<form method="GET" action={resolve('/recherche')} role="search">
		<label for="search-q">Rechercher</label>
		<div class="row">
			<!-- svelte-ignore a11y_autofocus -->
			<input
				id="search-q"
				type="search"
				name="q"
				value={data.q}
				autofocus={data.q === ''}
				autocomplete="off"
			/>
			<button type="submit">Rechercher</button>
		</div>
	</form>

	{#if data.results !== null}
		{#if data.results.length === 0}
			<p class="empty">Aucun résultat pour « {data.q} »</p>
		{:else}
			<ul class="results">
				{#each data.results as result (result.kind === 'entry' ? `e${result.id}` : `j${result.id}`)}
					<li>
						<a
							class="card pane"
							href={result.kind === 'entry'
								? resolve('/entries/[id]', { id: String(result.id) })
								: resolve('/journal/[date]', { date: result.day })}
						>
							<span class="kind">{result.kind === 'entry' ? 'Entrée' : 'Journal'}</span>
							<span class="title">
								{result.kind === 'entry' ? result.title : `${result.day} — ${result.author}`}
							</span>
							<span class="snippet">{result.snippet}</span>
						</a>
					</li>
				{/each}
			</ul>
		{/if}
	{/if}
</div>

<style>
	form {
		margin-block: 1.25rem;
	}

	label {
		display: block;
		font-size: 0.9375rem;
		font-weight: 600;
		margin-bottom: 0.375rem;
	}

	.row {
		display: flex;
		gap: 0.5rem;
	}

	input {
		flex: 1;
		min-width: 0;
		border-radius: var(--radius-pill);
		padding-inline: 1.125rem;
	}

	.empty {
		color: var(--color-text-muted);
		overflow-wrap: anywhere;
	}

	.results {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.card {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		text-decoration: none;
		color: var(--color-text);
	}

	.kind {
		font-size: 0.8125rem;
		color: var(--color-text-muted);
	}

	.title {
		font-family: var(--font-serif);
		font-weight: 600;
		font-size: 1.125rem;
		overflow-wrap: anywhere;
	}

	.snippet {
		font-size: 0.9375rem;
		color: var(--color-text-muted);
		overflow-wrap: anywhere;
	}

	.card :global(mark) {
		background: var(--color-accent-soft);
		color: inherit;
		border-radius: var(--radius-sm);
		padding: 0 0.2em;
	}
</style>

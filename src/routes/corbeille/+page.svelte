<script lang="ts">
	import { enhance } from '$app/forms';
	import ConfirmButton from '$lib/components/ConfirmButton.svelte';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<svelte:head>
	<title>Corbeille — Notre timeline</title>
</svelte:head>

<main>
	<h1>Corbeille</h1>

	{#if form && 'message' in form}
		<p class="error" role="alert">{form.message}</p>
	{/if}

	{#if data.items.length === 0}
		<p class="empty">La corbeille est vide</p>
	{:else}
		<ul class="items">
			{#each data.items as item (`${item.kind}-${item.id}`)}
				<li class="item">
					<p class="type">{item.typeLabel}</p>
					<p class="title">{item.title}</p>
					<p class="dates">
						Supprimé le {item.deletedAt} · suppression définitive le {item.expiresAt}
					</p>
					{#if item.actionable}
						<form method="POST" use:enhance class="actions">
							<input type="hidden" name="kind" value={item.kind} />
							<input type="hidden" name="id" value={item.id} />
							<button type="submit" formaction="?/restore" class="restore">Restaurer</button>
							<ConfirmButton
								label="Supprimer définitivement"
								confirmText="Supprimer définitivement ?"
								formaction="?/purge"
							/>
						</form>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
</main>

<style>
	main {
		max-width: 40rem;
		margin: 0 auto;
		padding: 1rem;
	}

	.items {
		display: grid;
		gap: 0.75rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.item {
		padding: 0.75rem 1rem;
		border: 1px solid var(--color-border);
		border-radius: 0.5rem;
		background: var(--color-surface);
	}

	.item p {
		margin: 0.25rem 0;
	}

	.type,
	.dates,
	.empty {
		color: var(--color-text-muted);
	}

	.type {
		font-size: 0.875rem;
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}

	.title {
		font-weight: 600;
		overflow-wrap: anywhere;
	}

	.dates {
		font-size: 0.875rem;
	}

	.error {
		color: var(--color-danger);
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem;
		margin-top: 0.5rem;
	}

	.restore {
		min-height: 44px;
		min-width: 44px;
		padding: 0 1rem;
		border: 1px solid var(--color-border);
		border-radius: 0.5rem;
		background: var(--color-bg);
		color: var(--color-text);
		cursor: pointer;
	}
</style>

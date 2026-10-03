<script lang="ts">
	import { enhance } from '$app/forms';
	import ConfirmButton from '$lib/components/ConfirmButton.svelte';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<svelte:head>
	<title>Corbeille — Notre timeline</title>
</svelte:head>

<main class="page-narrow">
	<h1>Corbeille</h1>

	{#if form && 'message' in form}
		<p class="error" role="alert">{form.message}</p>
	{/if}

	{#if data.items.length === 0}
		<p class="empty">La corbeille est vide</p>
	{:else}
		<ul class="items pane">
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
								class="btn-danger"
							/>
						</form>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
</main>

<style>
	h1 {
		margin-bottom: 1.25rem;
	}

	.items {
		margin: 0;
		list-style: none;
		padding-block: 0.25rem;
	}

	.item {
		padding-block: 0.875rem;
		border-top: 1px solid var(--hairline);
	}

	.item:first-child {
		border-top: none;
	}

	.item p {
		margin: 0.125rem 0;
	}

	.type,
	.dates {
		color: var(--color-text-muted);
	}

	.empty {
		margin-top: 3rem;
		text-align: center;
		color: var(--color-text-muted);
	}

	.type {
		font-size: 0.8125rem;
	}

	.title {
		font-family: var(--font-serif);
		font-weight: 600;
		font-size: 1.125rem;
		overflow-wrap: anywhere;
	}

	.dates {
		font-size: 0.8125rem;
	}

	.error {
		color: var(--color-danger);
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin-top: 0.5rem;
	}

	.restore {
		background: var(--surface-strong);
		border: 1px solid var(--color-border);
		color: var(--color-text);
	}
</style>

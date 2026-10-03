<script lang="ts">
	import EntryForm from '$lib/components/EntryForm.svelte';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const authorInfo = $derived(
		`Créé par ${data.meta.createdBy} le ${data.meta.createdAt}, modifié par ${data.meta.updatedBy} le ${data.meta.updatedAt}`
	);
</script>

<svelte:head>
	<title>Modifier l'entrée — Notre timeline</title>
</svelte:head>

<main class="page-narrow">
	<h1>Modifier l'entrée</h1>
	<p class="meta">{authorInfo}</p>
	<EntryForm values={form?.values ?? data.values} errors={form?.errors} submitLabel="Enregistrer" />
</main>

<style>
	.meta {
		margin: 0.5rem 0 1.25rem;
		color: var(--color-text-muted);
		font-size: 0.8125rem;
	}
</style>

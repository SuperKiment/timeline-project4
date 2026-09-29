<script lang="ts">
	import EntryForm from '$lib/components/EntryForm.svelte';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
</script>

<svelte:head>
	<title>Nouvelle entrée — Notre timeline</title>
</svelte:head>

<main>
	<h1>Nouvelle entrée</h1>
	<EntryForm values={form?.values ?? data.values} errors={form?.errors} submitLabel="Créer" />
</main>

<style>
	main {
		max-width: 40rem;
		margin: 0 auto;
		padding: 1rem;
	}
</style>

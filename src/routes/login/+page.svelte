<script lang="ts">
	import { onMount } from 'svelte';
	import { clearAllDrafts } from '$lib/journal/draft';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	// Visiting /login means there is no session: drop drafts left by a previous user.
	onMount(() => clearAllDrafts(() => localStorage));
</script>

<svelte:head>
	<title>Connexion — Notre timeline</title>
</svelte:head>

<main>
	<h1>Connexion</h1>

	<form method="POST">
		<input type="hidden" name="redirectTo" value={data.redirectTo ?? ''} />

		<label>
			Identifiant
			<input
				type="text"
				name="username"
				autocomplete="username"
				value={form?.username ?? ''}
				required
			/>
		</label>

		<label>
			Mot de passe
			<input type="password" name="password" autocomplete="current-password" required />
		</label>

		{#if form?.error}
			<p class="error" role="alert">{form.error}</p>
		{/if}

		<button type="submit">Se connecter</button>
	</form>
</main>

<style>
	main {
		max-width: 24rem;
		margin: 4rem auto;
		padding: 0 1rem;
	}

	form {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	label {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.error {
		color: var(--color-danger);
	}
</style>

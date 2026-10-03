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
	<div class="sheet">
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
	</div>
</main>

<style>
	main {
		min-height: 100dvh;
		display: grid;
		place-items: center;
		padding: 1rem;
	}

	.sheet {
		width: 100%;
		max-width: 400px;
		padding: 2rem;
		background: var(--glass-bg);
		-webkit-backdrop-filter: var(--blur);
		backdrop-filter: var(--blur);
		border: 1px solid var(--glass-border);
		border-radius: var(--radius-xl);
		box-shadow: var(--shadow-float);
	}

	h1 {
		margin-bottom: 1.5rem;
		text-align: center;
	}

	form {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	label {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
		font-size: 0.9375rem;
		font-weight: 500;
	}

	input {
		width: 100%;
	}

	button[type='submit'] {
		width: 100%;
	}

	.error {
		margin: 0;
		color: var(--color-danger);
		font-size: 0.9375rem;
	}
</style>

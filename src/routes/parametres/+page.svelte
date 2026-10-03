<script lang="ts">
	import { resolve } from '$app/paths';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>Paramètres — Notre timeline</title>
</svelte:head>

<div class="page-narrow">
	<h1>Paramètres</h1>

	<section class="pane">
		<h2>Compte</h2>
		<p>
			Connecté en tant que <strong>{data.user.displayName}</strong>
			<span class="muted">(@{data.user.username})</span>
		</p>
		<form method="POST" action="/logout">
			<button type="submit" class="btn-ghost logout">Se déconnecter</button>
		</form>
	</section>

	<section class="pane">
		<h2>Données</h2>
		<p class="row">
			<a class="btn" href={resolve('/api/export')} download>Exporter en JSON</a>
		</p>
		<p class="muted">
			Cet export contient vos entrées, votre journal et les métadonnées des médias, mais pas les
			fichiers photo/vidéo eux-mêmes. Pour une sauvegarde complète du serveur, exécutez
			<code>npm run backup</code>.
		</p>
	</section>
</div>

<style>
	h1 {
		margin-bottom: 1.25rem;
	}

	section {
		margin-bottom: 1rem;
		padding-block: 0.5rem;
	}

	h2 {
		padding-block: 0.5rem;
	}

	section > :global(p),
	section > form {
		margin: 0;
		padding-block: 0.875rem;
		border-top: 1px solid var(--hairline);
	}

	section > :global(p):first-of-type {
		border-top: none;
	}

	section > h2 + :global(*) {
		border-top: none;
	}

	.muted {
		color: var(--color-text-muted);
		font-size: 0.9375rem;
	}

	section > p.muted {
		overflow-wrap: anywhere;
	}

	a.btn {
		background: var(--surface-strong);
	}

	.logout {
		background: var(--surface-strong);
		border: 1px solid var(--color-border);
		color: var(--color-danger);
	}
</style>

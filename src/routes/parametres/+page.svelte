<script lang="ts">
	import { resolve } from '$app/paths';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>Paramètres — Notre timeline</title>
</svelte:head>

<h1>Paramètres</h1>

<section>
	<h2>Compte</h2>
	<p>
		Connecté en tant que <strong>{data.user.displayName}</strong>
		<span class="muted">(@{data.user.username})</span>
	</p>
	<form method="POST" action="/logout">
		<button type="submit">Se déconnecter</button>
	</form>
</section>

<section>
	<h2>Données</h2>
	<p>
		<a class="btn" href={resolve('/api/export')} download>Exporter en JSON</a>
	</p>
	<p class="muted">
		Cet export contient vos entrées, votre journal et les métadonnées des médias, mais pas les
		fichiers photo/vidéo eux-mêmes. Pour une sauvegarde complète du serveur, exécutez
		<code>npm run backup</code>.
	</p>
</section>

<style>
	section {
		margin-block: 2rem;
	}

	.muted {
		color: var(--color-text-muted);
	}
</style>

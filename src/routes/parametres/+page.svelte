<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import { installState, isAppleMobile } from '$lib/pwa/install';
	import { installPrompt } from '$lib/pwa/install-prompt.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// Browser-only facts, unknown during SSR: the section shows a placeholder until mounted.
	let device = $state<{ standalone: boolean; secure: boolean; ios: boolean; origin: string }>();

	onMount(() => {
		device = {
			standalone:
				matchMedia('(display-mode: standalone)').matches ||
				(navigator as Navigator & { standalone?: boolean }).standalone === true,
			secure: window.isSecureContext,
			ios: isAppleMobile(navigator.userAgent, navigator.maxTouchPoints),
			origin: location.origin
		};
	});

	const install = $derived(
		device &&
			installState({
				installed: device.standalone || installPrompt.installed,
				secure: device.secure,
				canPrompt: installPrompt.available,
				ios: device.ios
			})
	);
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

	<section class="pane">
		<h2>Application</h2>
		{#if install === 'installed'}
			<p>L'application est installée sur cet appareil.</p>
		{:else if install === 'insecure'}
			<p>
				L'installation nécessite une connexion sécurisée (HTTPS). Cette page est ouverte via
				<code>{device?.origin}</code>, une adresse non sécurisée.
			</p>
			<p class="muted">
				Configurez HTTPS sur le serveur (voir <code>docs/DEPLOY-RPI.md</code>, section 7 « HTTPS sur
				le LAN »), puis ouvrez l'application à son adresse <code>https://</code>.
			</p>
		{:else if install === 'prompt'}
			<p class="row">
				<button type="button" class="btn-primary" onclick={() => installPrompt.prompt()}>
					Installer l'application
				</button>
			</p>
			<p class="muted">Elle s'ouvrira depuis l'écran d'accueil, sans la barre du navigateur.</p>
		{:else if install === 'ios'}
			<p>Pour installer l'application, touchez Partager, puis « Sur l'écran d'accueil ».</p>
		{:else if install === 'menu'}
			<p>
				Pour installer l'application, ouvrez le menu du navigateur, puis choisissez « Installer
				l'application ».
			</p>
		{:else}
			<p class="muted" aria-hidden="true">&nbsp;</p>
		{/if}
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

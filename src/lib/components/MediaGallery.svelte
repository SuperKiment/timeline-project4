<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import type { MediaItem } from '$lib/media/types';
	import { extractErrorMessage, loginRedirectUrl } from '$lib/media/upload-client';
	import ConfirmButton from './ConfirmButton.svelte';

	/**
	 * Grid of media thumbnails. Photo click opens the full image in a <dialog>;
	 * videos play inline (poster or generic icon). Each item has a delete button.
	 *
	 * Props:
	 * - `items`      media to show (`thumbUrl` may be '' for videos without poster)
	 * - `canDelete`  show the delete button (default true; false for read-only views)
	 */
	let { items, canDelete = true }: { items: MediaItem[]; canDelete?: boolean } = $props();

	let viewer: HTMLDialogElement | undefined = $state();
	let viewed: MediaItem | null = $state(null);
	let error = $state('');

	function openPhoto(item: MediaItem) {
		viewed = item;
		viewer?.showModal();
	}

	async function remove(item: MediaItem) {
		error = '';
		try {
			const res = await fetch(`/api/media/${item.id}`, { method: 'DELETE' });
			if (res.status === 401) {
				location.href = loginRedirectUrl(location.pathname, location.search);
				return;
			}
			if (!res.ok) {
				error = extractErrorMessage(await res.text(), 'Suppression impossible.');
				return;
			}
			await invalidateAll();
		} catch {
			error = 'Suppression impossible. Vérifiez votre connexion.';
		}
	}
</script>

{#if error}
	<p class="error" role="alert">{error}</p>
{/if}

<ul class="grid">
	{#each items as item (item.id)}
		<li>
			<div class="cell">
				{#if item.kind === 'photo'}
					<button
						type="button"
						class="thumb"
						aria-label="Agrandir la photo"
						onclick={() => openPhoto(item)}
					>
						<img src={item.thumbUrl} alt="" loading="lazy" />
					</button>
				{:else}
					<!-- svelte-ignore a11y_media_has_caption -->
					<video
						controls
						preload="metadata"
						poster={item.thumbUrl || undefined}
						src={item.url}
						class:noposter={!item.thumbUrl}
					></video>
					{#if !item.thumbUrl}
						<span class="icon" aria-hidden="true">🎬</span>
					{/if}
				{/if}
			</div>
			{#if canDelete}
				<ConfirmButton
					label="Supprimer"
					confirmText="Supprimer ce média ?"
					onconfirm={() => remove(item)}
				/>
			{/if}
		</li>
	{/each}
</ul>

<dialog bind:this={viewer} class="viewer" aria-label="Photo" onclose={() => (viewed = null)}>
	{#if viewed}
		<img src={viewed.url} alt="" />
	{/if}
	<button type="button" onclick={() => viewer?.close()}>Fermer</button>
</dialog>

<style>
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(9rem, 1fr));
		gap: 0.75rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	li {
		display: grid;
		gap: 0.375rem;
	}

	.cell {
		position: relative;
		aspect-ratio: 1;
		overflow: hidden;
		border: 1px solid var(--color-border);
		border-radius: 0.5rem;
		background: var(--color-surface);
	}

	.thumb {
		display: block;
		width: 100%;
		height: 100%;
		padding: 0;
		border: 0;
		background: transparent;
		cursor: zoom-in;
	}

	img,
	video {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}

	.icon {
		position: absolute;
		inset: 0;
		display: grid;
		place-items: center;
		font-size: 2.5rem;
		pointer-events: none;
	}

	.noposter {
		opacity: 0.35;
	}

	.error {
		color: var(--color-danger);
	}

	.viewer {
		max-width: 95vw;
		max-height: 95vh;
		padding: 0.5rem;
		border: 1px solid var(--color-border);
		border-radius: 0.75rem;
		background: var(--color-surface);
		color: var(--color-text);
	}

	.viewer::backdrop {
		background: rgb(0 0 0 / 0.7);
	}

	.viewer img {
		width: auto;
		max-width: 100%;
		max-height: 80vh;
		object-fit: contain;
	}

	.viewer button {
		min-height: 44px;
		min-width: 44px;
		margin-top: 0.5rem;
		padding: 0 1rem;
		border: 1px solid var(--color-border);
		border-radius: 0.5rem;
		background: var(--color-bg);
		color: var(--color-text);
		cursor: pointer;
	}
</style>

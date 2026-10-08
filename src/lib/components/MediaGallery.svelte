<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import type { MediaItem } from '$lib/media/types';
	import { viewerSrcset } from '$lib/media/variants';
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
						<img
							src={item.thumbUrl}
							alt=""
							loading="lazy"
							decoding="async"
							width={item.width}
							height={item.height}
						/>
					</button>
				{:else}
					<!-- svelte-ignore a11y_media_has_caption -->
					<video
						controls
						preload="none"
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
					class="btn-danger"
					confirmText="Supprimer ce média ?"
					onconfirm={() => remove(item)}
				/>
			{/if}
		</li>
	{/each}
</ul>

<dialog bind:this={viewer} class="viewer glass" aria-label="Photo" onclose={() => (viewed = null)}>
	{#if viewed}
		{@const ratio = viewed.width && viewed.height ? viewed.width / viewed.height : null}
		<img
			src={viewed.displayUrl}
			srcset={viewerSrcset(viewed)}
			sizes="min(95vw, 1100px)"
			alt=""
			width={viewed.width}
			height={viewed.height}
			class:sized={ratio}
			style:--ratio={ratio}
		/>
	{/if}
	<button type="button" class="glass close" onclick={() => viewer?.close()}>Fermer</button>
</dialog>

<style>
	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(9rem, 1fr));
		gap: 8px;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	li {
		display: grid;
		gap: 0.375rem;
		align-content: start;
	}

	.cell {
		position: relative;
		aspect-ratio: 1;
		overflow: hidden;
		border: 1px solid var(--glass-border);
		border-radius: var(--radius-md);
		background: var(--surface);
	}

	.thumb {
		display: block;
		width: 100%;
		height: 100%;
		min-height: 0;
		padding: 0;
		border: 0;
		border-radius: 0;
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
		max-width: min(95vw, 1100px);
		max-height: 95vh;
		padding: 0.75rem;
		border-radius: var(--radius-xl);
		color: var(--color-text);
	}

	/* No blur: a full-screen photo hides the page anyway, and blurring it is costly on phones. */
	.viewer::backdrop {
		background: rgb(10 12 16 / 0.82);
	}

	.viewer img {
		width: auto;
		height: auto;
		max-width: 100%;
		max-height: 80vh;
		border-radius: var(--radius-md);
		object-fit: contain;
	}

	/* Known dimensions: reserve the final box before the photo loads (no reflow). */
	.viewer img.sized {
		width: min(calc(min(95vw, 1100px) - 1.5rem - 2px), calc(80vh * var(--ratio)));
		aspect-ratio: var(--ratio);
	}

	.viewer .close {
		min-height: 44px;
		min-width: 44px;
		margin-top: 0.5rem;
		padding: 0 1.125rem;
		border-radius: var(--radius-pill);
		box-shadow: none;
		color: var(--color-text);
	}
</style>

<script lang="ts">
	import { invalidateAll } from '$app/navigation';
	import { uploadFiles, type OwnerFields } from '$lib/media/upload-client';
	import type { MediaItem } from '$lib/media/types';

	/**
	 * File picker with per-file progress and error list.
	 *
	 * Props:
	 * - `owner`       form fields identifying the owner, e.g. `{ ownerKind: 'entry', ownerId: 3 }`
	 *                 or `{ ownerKind: 'occurrence', seriesId: 2, date: '2026-01-01' }`
	 * - `onuploaded`  optional callback with the successfully uploaded items (before `invalidateAll()`)
	 *
	 * Files upload sequentially; a failing file does not block the others.
	 */
	let {
		owner,
		onuploaded
	}: {
		owner: OwnerFields;
		onuploaded?: (items: MediaItem[]) => void;
	} = $props();

	let input: HTMLInputElement | undefined = $state();
	let uploading = $state(false);
	let names: string[] = $state([]);
	let ratios: number[] = $state([]);
	let errors: string[] = $state([]);

	async function onchange() {
		const files = Array.from(input?.files ?? []);
		if (files.length === 0 || uploading) return;
		uploading = true;
		names = files.map((f) => f.name);
		ratios = files.map(() => 0);
		errors = [];
		try {
			const outcomes = await uploadFiles(files, owner, ({ index, ratio }) => {
				ratios[index] = ratio;
			});
			errors = outcomes.flatMap((o) => (o.ok ? [] : [`${o.file.name} : ${o.message}`]));
			const items = outcomes.flatMap((o) => (o.ok ? [o.item] : []));
			if (items.length > 0) {
				onuploaded?.(items);
				await invalidateAll();
			}
		} finally {
			uploading = false;
			if (input) input.value = '';
		}
	}
</script>

<div class="uploader">
	<label class="pick" class:disabled={uploading}>
		<span>{uploading ? 'Téléversement…' : 'Ajouter des photos ou vidéos'}</span>
		<input
			bind:this={input}
			type="file"
			multiple
			accept="image/*,video/mp4,video/quicktime,video/webm"
			disabled={uploading}
			{onchange}
		/>
	</label>

	{#if uploading || names.length > 0}
		<ul class="files">
			{#each names as name, i (i)}
				<li>
					<span class="name">{name}</span>
					<progress max="1" value={ratios[i]} aria-label={`Progression : ${name}`}></progress>
				</li>
			{/each}
		</ul>
	{/if}

	{#if errors.length > 0}
		<ul class="errors" role="alert">
			{#each errors as message, i (i)}
				<li>{message}</li>
			{/each}
		</ul>
	{/if}
</div>

<style>
	.uploader {
		display: grid;
		gap: 0.75rem;
	}

	.pick {
		display: flex;
		align-items: center;
		justify-content: center;
		min-height: 44px;
		padding: 1.25rem 1rem;
		border: 1.5px dashed var(--color-border);
		border-radius: var(--radius-lg);
		background: var(--surface);
		color: var(--color-text);
		font-weight: 600;
		text-align: center;
		cursor: pointer;
	}

	.pick:focus-within {
		outline: 2px solid var(--color-accent);
		outline-offset: 2px;
	}

	.pick.disabled {
		opacity: 0.6;
		cursor: progress;
	}

	/* Visually hidden but focusable; the label is the touch target. */
	input {
		position: absolute;
		width: 1px;
		height: 1px;
		min-height: 0;
		opacity: 0;
		overflow: hidden;
	}

	ul {
		margin: 0;
		padding: 0;
		list-style: none;
		display: grid;
		gap: 0.5rem;
	}

	.files li {
		display: grid;
		gap: 0.25rem;
	}

	.name {
		overflow-wrap: anywhere;
		color: var(--color-text-muted);
		font-size: 0.8125rem;
	}

	progress {
		width: 100%;
		height: 8px;
		appearance: none;
		border: none;
		border-radius: var(--radius-pill);
		background: var(--hairline);
		overflow: hidden;
	}

	progress::-webkit-progress-bar {
		background: var(--hairline);
	}

	progress::-webkit-progress-value {
		background: var(--color-accent);
		border-radius: var(--radius-pill);
	}

	progress::-moz-progress-bar {
		background: var(--color-accent);
		border-radius: var(--radius-pill);
	}

	.errors {
		color: var(--color-danger);
		font-size: 0.9375rem;
	}
</style>

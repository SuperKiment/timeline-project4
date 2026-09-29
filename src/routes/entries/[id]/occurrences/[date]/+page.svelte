<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import MediaGallery from '$lib/components/MediaGallery.svelte';
	import MediaUploader from '$lib/components/MediaUploader.svelte';
	import { formatDayFr } from '$lib/dates/format';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let note = $derived(form && 'note' in form ? form.note : data.note);
	let saving = $state(false);
</script>

<svelte:head>
	<title>{data.title} — {formatDayFr(data.date)} — Notre timeline</title>
</svelte:head>

<main>
	<p class="back">
		<a href={resolve('/entries/[id]', { id: String(data.seriesId) })}>← {data.title}</a>
	</p>
	<h1>{data.title}</h1>
	<p class="date">{formatDayFr(data.date, 'full')}</p>

	<section aria-label="Note">
		<h2>Note</h2>
		{#if form && 'message' in form && form.message}
			<p class="error" role="alert">{form.message}</p>
		{/if}
		<form
			method="POST"
			action="?/save"
			use:enhance={() => {
				saving = true;
				return async ({ update }) => {
					saving = false;
					await update({ reset: false });
				};
			}}
		>
			<label class="field">
				<span>Note pour cette occurrence</span>
				<textarea name="note" rows="6" value={note}></textarea>
			</label>
			<button type="submit" disabled={saving}>{saving ? 'Enregistrement…' : 'Enregistrer'}</button>
			{#if form && 'saved' in form && form.saved}
				<p class="saved" role="status">Note enregistrée.</p>
			{/if}
		</form>
	</section>

	<section aria-label="Médias">
		<h2>Médias</h2>
		<MediaGallery items={data.media} />
		<MediaUploader owner={{ ownerKind: 'occurrence', seriesId: data.seriesId, date: data.date }} />
	</section>
</main>

<style>
	main {
		max-width: 40rem;
		margin: 0 auto;
		padding: 1rem;
	}

	h1 {
		margin: 0.25rem 0;
		overflow-wrap: anywhere;
	}

	.back a {
		display: inline-flex;
		align-items: center;
		min-height: 44px;
	}

	.date {
		margin: 0.25rem 0 1rem;
		color: var(--color-text-muted);
	}

	.field {
		display: grid;
		gap: 0.25rem;
		margin-bottom: 0.75rem;
	}

	textarea {
		width: 100%;
		box-sizing: border-box;
		padding: 0.5rem;
		font: inherit;
	}

	button[type='submit'] {
		min-height: 44px;
		padding: 0 1rem;
	}

	.error {
		color: var(--color-danger, #b00020);
	}

	.saved {
		color: var(--color-text-muted);
	}
</style>

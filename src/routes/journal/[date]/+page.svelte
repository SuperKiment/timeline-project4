<script lang="ts">
	import { tick, untrack } from 'svelte';
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import ConfirmButton from '$lib/components/ConfirmButton.svelte';
	import MediaGallery from '$lib/components/MediaGallery.svelte';
	import MediaUploader from '$lib/components/MediaUploader.svelte';
	import { clearDraft, loadDraft, saveDraft } from '$lib/journal/draft';
	import { MOODS, MOOD_LABELS } from '$lib/journal/moods';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	let text = $state(untrack(() => data.own?.text ?? ''));
	let mood: string | null = $state(untrack(() => data.own?.mood ?? null));
	let restored = $state(false);
	let saving = $state(false);
	let mounted = false;
	// text/mood as submitted while a save is in flight (null otherwise).
	let inFlight: { text: string; mood: string | null } | null = null;

	function editedSinceSubmit(): boolean {
		return inFlight !== null && (text !== inFlight.text || mood !== inFlight.mood);
	}

	// Reset the editor when navigating to another day / after invalidation.
	let lastKey = untrack(() => `${data.day}:${data.own?.updatedAt ?? ''}`);
	$effect(() => {
		const key = `${data.day}:${data.own?.updatedAt ?? ''}`;
		if (key === lastKey) return;
		lastKey = key;
		// Keystrokes typed while saving must survive the post-save invalidation.
		if (untrack(editedSinceSubmit)) return;
		text = data.own?.text ?? '';
		mood = data.own?.mood ?? null;
		restored = false;
		restoreDraft();
	});

	function restoreDraft() {
		if (data.isFuture) return;
		const draft = loadDraft(
			localStorage,
			data.userId,
			data.day,
			data.own && { text: data.own.text, mood: data.own.mood, updatedAt: data.own.updatedAt }
		);
		if (draft) {
			text = draft.text;
			mood = draft.mood;
			restored = true;
		}
	}

	$effect(() => {
		if (!mounted) {
			mounted = true;
			restoreDraft();
		}
	});

	function persistDraft() {
		saveDraft(localStorage, data.userId, data.day, text, mood);
	}

	const dayLabel = $derived(
		new Intl.DateTimeFormat('fr-FR', {
			dateStyle: 'full',
			timeZone: 'UTC'
		}).format(new Date(`${data.day}T00:00:00Z`))
	);

	function jump(event: Event & { currentTarget: HTMLInputElement }) {
		const value = event.currentTarget.value;
		if (/^\d{4}-\d{2}-\d{2}$/.test(value)) void goto(resolve('/journal/[date]', { date: value }));
	}
</script>

<svelte:head>
	<title>Journal du {data.day} — Notre timeline</title>
</svelte:head>

<main>
	<h1>Journal</h1>

	<nav class="daynav" aria-label="Changer de jour">
		<a class="btn" href={resolve('/journal/[date]', { date: data.prevDay })} rel="prev">
			<span aria-hidden="true">←</span> Jour précédent
		</a>
		<label class="jump">
			<span class="sr-only">Aller à une date</span>
			<input type="date" value={data.day} max={data.today} onchange={jump} />
		</label>
		{#if data.nextDay}
			<a class="btn" href={resolve('/journal/[date]', { date: data.nextDay })} rel="next">
				Jour suivant <span aria-hidden="true">→</span>
			</a>
		{/if}
	</nav>

	<h2 class="day">{dayLabel}</h2>

	<div class="columns">
		<section class="col own" aria-label="Mon journal">
			<h3>Mon journal</h3>
			{#if data.isFuture}
				<p class="notice">Impossible d'écrire pour un jour futur</p>
			{:else}
				{#if restored}
					<p class="notice" role="status">Brouillon non enregistré restauré.</p>
				{/if}
				{#if form && 'message' in form && form.message}
					<p class="error" role="alert">{form.message}</p>
				{/if}
				<form
					method="POST"
					action="?/save"
					use:enhance={() => {
						saving = true;
						const snapshot = { text, mood };
						inFlight = snapshot;
						return async ({ result, update }) => {
							saving = false;
							const unchanged = text === snapshot.text && mood === snapshot.mood;
							if (result.type === 'success' && unchanged) {
								clearDraft(localStorage, data.userId, data.day);
								restored = false;
							}
							await update({ reset: false });
							await tick();
							// Edited during the save: keep the newer text and its draft.
							if (!(text === snapshot.text && mood === snapshot.mood)) persistDraft();
							inFlight = null;
						};
					}}
				>
					<label class="field">
						<span>Ce que j'ai vécu aujourd'hui</span>
						<textarea name="text" rows="10" bind:value={text} oninput={persistDraft}></textarea>
					</label>
					<fieldset class="moods">
						<legend>Humeur</legend>
						<label class="chip none">
							<input
								type="radio"
								name="mood"
								value=""
								checked={mood === null}
								onchange={() => {
									mood = null;
									persistDraft();
								}}
							/>
							<span>Aucune</span>
						</label>
						{#each MOODS as m (m)}
							<label class="chip">
								<input
									type="radio"
									name="mood"
									value={m}
									checked={mood === m}
									onchange={() => {
										mood = m;
										persistDraft();
									}}
								/>
								<span title={MOOD_LABELS[m]}
									><span aria-hidden="true">{m}</span><span class="sr-only">{MOOD_LABELS[m]}</span
									></span
								>
							</label>
						{/each}
					</fieldset>
					<div class="actions">
						<button type="submit" class="primary" disabled={saving}>Enregistrer</button>
						{#if data.own}
							<ConfirmButton
								label="Supprimer"
								confirmText="Mettre cette entrée du journal à la corbeille ?"
								formaction="?/delete"
							/>
						{/if}
					</div>
					{#if form && 'saved' in form && form.saved}
						<p class="ok" role="status">Enregistré.</p>
					{/if}
				</form>

				{#if data.own}
					<h4>Photos et vidéos</h4>
					<MediaUploader owner={{ ownerKind: 'journal', ownerId: data.own.id }} />
					{#if data.own.media.length > 0}
						<MediaGallery items={data.own.media} />
					{/if}
				{:else}
					<p class="hint">Enregistrez d'abord pour ajouter des photos ou vidéos.</p>
				{/if}
			{/if}
		</section>

		<section class="col partner" aria-label="Journal de l'autre">
			{#if data.partner}
				<h3>Journal de {data.partner.authorName}</h3>
				{#if data.partner.mood}
					<p class="mood" aria-label="Humeur">{data.partner.mood}</p>
				{/if}
				<div class="markdown">
					<!-- eslint-disable-next-line svelte/no-at-html-tags -- sanitized server-side by renderMarkdown -->
					{@html data.partner.html}
				</div>
				{#if data.partner.media.length > 0}
					<MediaGallery items={data.partner.media} canDelete={false} />
				{/if}
			{:else}
				<h3>Journal de l'autre</h3>
				<p class="hint">Rien d'écrit pour ce jour.</p>
			{/if}
		</section>
	</div>

	{#if !data.isFuture}
		<p>
			<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- query string appended to a static path -->
			<a class="btn" href={`/entries/new?type=souvenir&date=${data.day}`}>Promouvoir en souvenir</a>
		</p>
	{/if}
</main>

<style>
	main {
		max-width: 64rem;
		margin: 0 auto;
		padding: 1rem;
	}

	.daynav {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		align-items: center;
	}

	.day {
		text-transform: capitalize;
	}

	.columns {
		display: grid;
		grid-template-columns: 1fr;
		gap: 1.5rem;
	}

	@media (min-width: 768px) {
		.columns {
			grid-template-columns: 1fr 1fr;
		}
	}

	.col {
		min-width: 0;
	}

	.field {
		display: grid;
		gap: 0.25rem;
	}

	textarea {
		width: 100%;
		box-sizing: border-box;
		padding: 0.5rem;
		font: inherit;
		color: inherit;
		background: var(--color-surface);
		border: 1px solid var(--color-border);
		border-radius: 0.5rem;
	}

	.moods {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		margin: 0.75rem 0;
		padding: 0;
		border: 0;
	}

	.moods legend {
		padding: 0;
		margin-bottom: 0.25rem;
	}

	.chip {
		position: relative;
	}

	.chip input {
		position: absolute;
		opacity: 0;
		inset: 0;
		margin: 0;
		min-height: 0;
		cursor: pointer;
	}

	.chip > span {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-height: 44px;
		min-width: 44px;
		padding: 0 0.5rem;
		border: 1px solid var(--color-border);
		border-radius: 0.5rem;
		font-size: 1.25rem;
	}

	.chip.none > span {
		font-size: 1rem;
	}

	.chip input:checked + span {
		background: var(--color-accent);
		color: var(--color-accent-contrast);
		border-color: var(--color-accent);
	}

	.chip input:focus-visible + span {
		outline: 2px solid var(--color-accent);
		outline-offset: 2px;
	}

	.actions {
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
	}

	.primary {
		padding: 0 1rem;
		border: 0;
		border-radius: 0.5rem;
		background: var(--color-accent);
		color: var(--color-accent-contrast);
		cursor: pointer;
	}

	.notice,
	.hint {
		color: var(--color-text-muted);
	}

	.error {
		color: var(--color-danger);
	}

	.mood {
		font-size: 2rem;
		margin: 0;
	}

	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}
</style>

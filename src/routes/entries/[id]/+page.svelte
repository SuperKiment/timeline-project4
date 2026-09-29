<script lang="ts">
	import { resolve } from '$app/paths';
	import ConfirmButton from '$lib/components/ConfirmButton.svelte';
	import MediaGallery from '$lib/components/MediaGallery.svelte';
	import MediaUploader from '$lib/components/MediaUploader.svelte';
	import { formatDayFr } from '$lib/dates/format';
	import type { EntryType } from '$lib/timeline/types';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const TYPE_LABELS: Record<EntryType, string> = {
		souvenir: 'Souvenir',
		important: 'Important',
		phase: 'Phase',
		recurrent: 'Récurrent',
		histoire: 'Histoire'
	};
</script>

<svelte:head>
	<title>{data.title} — Notre timeline</title>
</svelte:head>

<main>
	<article class:important={data.type === 'important'}>
		<header>
			<p class="type">{TYPE_LABELS[data.type]}</p>
			<h1>{data.title}</h1>
			<p class="period">{data.period}</p>
			{#if data.location}
				<p class="location">{data.location}</p>
			{/if}
			{#if data.tags.length > 0}
				<ul class="tags" aria-label="Tags">
					{#each data.tags as tag (tag)}
						<li>{tag}</li>
					{/each}
				</ul>
			{/if}
		</header>

		{#if data.descriptionHtml}
			<!-- Sanitized server-side by renderMarkdown (marked + sanitize-html allowlist). -->
			<!-- eslint-disable-next-line svelte/no-at-html-tags -->
			<div class="description">{@html data.descriptionHtml}</div>
		{/if}

		<!-- T30: SeriesOccurrences slot for `recurrent` entries goes here. -->

		<section aria-label="Médias">
			<h2>Médias</h2>
			<MediaGallery items={data.media} />
			<MediaUploader owner={{ ownerKind: 'entry', ownerId: data.id }} />
		</section>

		{#if data.journalDays.length > 0}
			<section aria-label="Journal">
				<h2>Journal sur la période</h2>
				<ul class="journal">
					{#each data.journalDays as link (link.day)}
						<li>
							<a href={resolve('/journal/[date]', { date: link.day })}>{formatDayFr(link.day)}</a>
							<span class="authors">{link.authors.join(', ')}</span>
						</li>
					{/each}
				</ul>
			</section>
		{/if}

		<p class="meta">
			Créé par {data.meta.createdBy} le {data.meta.createdAt}, modifié par {data.meta.updatedBy} le
			{data.meta.updatedAt}
		</p>

		<form method="POST" class="actions">
			<a class="btn edit" href={resolve('/entries/[id]/edit', { id: String(data.id) })}>Modifier</a>
			<ConfirmButton label="Supprimer" formaction="?/delete" />
		</form>
	</article>
</main>

<style>
	main {
		max-width: 40rem;
		margin: 0 auto;
		padding: 1rem;
	}

	article.important {
		border-left: 4px solid var(--color-important);
		padding-left: 0.75rem;
	}

	article.important h1,
	article.important .type {
		color: var(--color-important);
	}

	.type {
		margin: 0;
		font-size: 0.875rem;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: var(--color-text-muted);
	}

	h1 {
		margin: 0.25rem 0;
		overflow-wrap: anywhere;
	}

	.period,
	.location,
	.meta,
	.authors {
		color: var(--color-text-muted);
	}

	.period,
	.location {
		margin: 0.25rem 0;
	}

	.meta {
		font-size: 0.875rem;
	}

	.tags {
		display: flex;
		flex-wrap: wrap;
		gap: 0.375rem;
		margin: 0.5rem 0;
		padding: 0;
		list-style: none;
	}

	.tags li {
		padding: 0.125rem 0.625rem;
		border: 1px solid var(--color-border);
		border-radius: 999px;
		background: var(--color-surface);
		font-size: 0.875rem;
	}

	.description {
		margin: 1rem 0;
		overflow-wrap: anywhere;
	}

	.journal {
		display: grid;
		gap: 0.25rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.journal a {
		display: inline-flex;
		align-items: center;
		min-height: 44px;
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem;
		margin-top: 1.5rem;
	}

	.edit {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 0 1rem;
		border: 1px solid var(--color-border);
		border-radius: 0.5rem;
		background: var(--color-surface);
		color: var(--color-text);
		text-decoration: none;
	}
</style>

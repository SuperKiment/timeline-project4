<script lang="ts">
	import { resolve } from '$app/paths';
	import ConfirmButton from '$lib/components/ConfirmButton.svelte';
	import MediaGallery from '$lib/components/MediaGallery.svelte';
	import MediaUploader from '$lib/components/MediaUploader.svelte';
	import { formatDayFr } from '$lib/dates/format';
	import SeriesOccurrences from '$lib/components/SeriesOccurrences.svelte';
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

<main class="page-narrow">
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

		{#if data.series}
			<SeriesOccurrences
				seriesId={data.id}
				occurrences={data.series.occurrences}
				orphans={data.series.orphans}
			/>
		{/if}

		<section aria-label="Médias" class="pane">
			<h2>Médias</h2>
			<MediaGallery items={data.media} />
			<MediaUploader owner={{ ownerKind: 'entry', ownerId: data.id }} />
		</section>

		{#if data.journalDays.length > 0}
			<section aria-label="Journal" class="pane">
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
			<a class="btn" href={resolve('/entries/[id]/edit', { id: String(data.id) })}>Modifier</a>
			<ConfirmButton label="Supprimer" formaction="?/delete" />
		</form>
	</article>
</main>

<style>
	article {
		display: grid;
		gap: 1.25rem;
	}

	header {
		display: grid;
		justify-items: start;
		gap: 0.5rem;
	}

	.type {
		margin: 0;
		padding: 0.25rem 0.75rem;
		border-radius: var(--radius-pill);
		background: var(--surface-strong);
		color: var(--color-text-muted);
		font-size: 0.8125rem;
		font-weight: 500;
	}

	article.important .type {
		color: var(--color-important);
	}

	h1 {
		overflow-wrap: anywhere;
	}

	.period,
	.location,
	.meta,
	.authors {
		margin: 0;
		color: var(--color-text-muted);
	}

	.meta {
		font-size: 0.8125rem;
	}

	.tags {
		display: flex;
		flex-wrap: wrap;
		gap: 0.375rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.tags li {
		padding: 0.125rem 0.625rem;
		border-radius: var(--radius-pill);
		background: var(--surface-strong);
		border: 1px solid var(--hairline);
		color: var(--color-text-muted);
		font-size: 0.8125rem;
	}

	.description {
		font-family: var(--font-serif);
		font-size: 1.125rem;
		line-height: 1.65;
		max-width: 70ch;
		overflow-wrap: anywhere;
	}

	.pane h2 {
		margin-bottom: 0.75rem;
	}

	.journal {
		display: grid;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.journal li {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		column-gap: 0.75rem;
	}

	.journal li + li {
		border-top: 1px solid var(--hairline);
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
	}
</style>

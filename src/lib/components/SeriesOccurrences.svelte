<script lang="ts">
	import { resolve } from '$app/paths';
	import { formatDayFr } from '$lib/dates/format';
	import type { OrphanOccurrenceNote, SeriesOccurrence } from '$lib/server/entries/occurrences';

	/**
	 * Occurrences of a recurrent series (newest first) with note excerpt, media count and a
	 * link to each occurrence page, plus notes whose date is no longer an occurrence (EC-6).
	 *
	 * Props:
	 * - `seriesId`     id of the recurrent entry
	 * - `occurrences`  occurrences in chronological order (as returned by the service)
	 * - `orphans`      notes attached to dates that are no longer occurrences
	 */
	let {
		seriesId,
		occurrences,
		orphans
	}: { seriesId: number; occurrences: SeriesOccurrence[]; orphans: OrphanOccurrenceNote[] } =
		$props();

	const newestFirst = $derived([...occurrences].reverse());
</script>

<section aria-label="Occurrences">
	<h2>Occurrences</h2>
	{#if newestFirst.length === 0}
		<p class="empty">Aucune occurrence pour le moment.</p>
	{:else}
		<ul class="occurrences">
			{#each newestFirst as occ (occ.date)}
				<li>
					<a
						href={resolve('/entries/[id]/occurrences/[date]', {
							id: String(seriesId),
							date: occ.date
						})}
					>
						<span class="date">{formatDayFr(occ.date)}</span>
						{#if occ.note}<span class="note">{occ.note}</span>{/if}
						{#if occ.mediaCount > 0}
							<span class="count">
								{occ.mediaCount}
								{occ.mediaCount === 1 ? 'média' : 'médias'}
							</span>
						{/if}
					</a>
				</li>
			{/each}
		</ul>
	{/if}

	{#if orphans.length > 0}
		<section aria-label="Notes orphelines" class="orphans">
			<h3>Notes orphelines</h3>
			<p class="hint">Ces notes concernent des dates qui ne sont plus des occurrences.</p>
			<ul>
				{#each orphans as orphan (orphan.id)}
					<li>
						<span class="date">{formatDayFr(orphan.date)}</span>
						{#if orphan.note}<span class="note">{orphan.note}</span>{/if}
						{#if orphan.mediaCount > 0}
							<span class="count">
								{orphan.mediaCount}
								{orphan.mediaCount === 1 ? 'média' : 'médias'}
							</span>
						{/if}
					</li>
				{/each}
			</ul>
		</section>
	{/if}
</section>

<style>
	ul {
		display: grid;
		gap: 0.5rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.occurrences a {
		display: grid;
		gap: 0.125rem;
		min-height: 44px;
		padding: 0.5rem 0.75rem;
		border: 1px solid var(--color-border);
		border-radius: 0.5rem;
		background: var(--color-surface);
		color: var(--color-text);
		text-decoration: none;
	}

	.orphans li {
		display: grid;
		gap: 0.125rem;
		padding: 0.5rem 0.75rem;
		border: 1px dashed var(--color-border);
		border-radius: 0.5rem;
	}

	.date {
		font-weight: 600;
	}

	.note {
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
		overflow-wrap: anywhere;
		white-space: pre-line;
	}

	.count,
	.hint,
	.empty {
		color: var(--color-text-muted);
		font-size: 0.875rem;
	}
</style>

<script lang="ts">
	import { onMount } from 'svelte';
	import { FRENCH_MONTHS } from '../../dates/fuzzy';
	import {
		activeLanes,
		assignPhaseLanes,
		buildSections,
		groupByYearMonth,
		todayMarkerIndex,
		type RenderSection
	} from '../../timeline/layout';
	import type { TimelineItem } from '../../timeline/types';
	import TimelineCard from './TimelineCard.svelte';

	let { items, today }: { items: TimelineItem[]; today: string } = $props();

	const groups = $derived(groupByYearMonth(items));
	const sections = $derived(buildSections(groups));
	const phases = $derived(items.filter((item) => item.type === 'phase'));
	const phaseLanes = $derived(assignPhaseLanes(phases, today));
	const markerIndex = $derived(todayMarkerIndex(sections, today));
	const years = $derived(groups.map((g) => g.year));

	function sectionLabel(section: RenderSection): string {
		return section.kind === 'year'
			? String(section.year)
			: `${FRENCH_MONTHS[section.month! - 1]} ${section.year}`;
	}

	function jumpToYear(event: Event) {
		const select = event.target as HTMLSelectElement;
		const year = select.value;
		if (!year) return;
		document.getElementById(`y-${year}`)?.scrollIntoView({ block: 'start' });
		select.value = '';
	}

	onMount(() => {
		document.getElementById('today')?.scrollIntoView({ block: 'center' });
	});
</script>

{#if years.length > 1}
	<label class="year-jump">
		<span>Aller à l'année</span>
		<select onchange={jumpToYear} aria-label="Aller à l'année">
			<option value="" disabled selected>Aller à l'année</option>
			{#each years as year (year)}
				<option value={year}>{year}</option>
			{/each}
		</select>
	</label>
{/if}

<div class="vertical-timeline">
	{#each sections as section, i (section.id)}
		{#if i === markerIndex}
			<div id="today" class="today-marker"><span>Aujourd'hui</span></div>
		{/if}

		<section class="ym-section">
			<h2
				id={section.kind === 'year' ? section.id : undefined}
				class="separator"
				class:year={section.kind === 'year'}
			>
				{sectionLabel(section)}
			</h2>

			<div class="row">
				<div class="lanes" aria-hidden="true">
					{#each activeLanes(phaseLanes, section.fromDay, section.toDay) as lane (lane)}
						<div class="lane-band" data-lane={lane}></div>
					{/each}
				</div>

				<div class="columns">
					<div class="main-column">
						{#each section.mainItems as item (item.key)}
							<TimelineCard {item} />
						{/each}
					</div>

					{#if section.histoireItems.length > 0}
						<div class="histoire-column">
							{#each section.histoireItems as item (item.key)}
								<TimelineCard {item} />
							{/each}
						</div>
					{/if}
				</div>
			</div>
		</section>
	{/each}

	{#if markerIndex === sections.length}
		<div id="today" class="today-marker"><span>Aujourd'hui</span></div>
	{/if}
</div>

<style>
	.year-jump {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 0;
		color: var(--color-text-muted);
		font-size: 0.9375rem;
	}

	.vertical-timeline {
		display: flex;
		flex-direction: column;
	}

	.ym-section {
		content-visibility: auto;
		contain-intrinsic-size: auto 200px;
		padding: 0.5rem 0;
	}

	/* Sticky over scrolling content: a near-opaque fill instead of a blur that
	   would be re-rendered on every scroll frame. */
	.separator {
		position: sticky;
		top: env(safe-area-inset-top, 0px);
		z-index: 1;
		margin: 0 0 0.5rem;
		padding: 0.5rem 0.75rem;
		border-radius: var(--radius-md);
		background: var(--glass-bg-dense);
		font-family: var(--font-sans);
		font-size: 0.9375rem;
		font-weight: 600;
		line-height: 1.3;
		color: var(--color-text-muted);
	}

	.separator::first-letter {
		text-transform: uppercase;
	}

	.separator.year {
		font-family: var(--font-serif);
		font-size: 1.75rem;
		line-height: 1.2;
		color: var(--color-text);
	}

	.row {
		display: flex;
		gap: 0.5rem;
		border-left: 1px solid var(--hairline);
	}

	.lanes {
		flex: none;
		width: calc(3 * 0.5rem);
		display: flex;
		gap: 2px;
		padding-left: 4px;
	}

	.lane-band {
		width: 6px;
		border-radius: var(--radius-pill);
		background: color-mix(in srgb, var(--color-accent) 35%, transparent);
	}

	.lane-band[data-lane='1'] {
		background: color-mix(in srgb, var(--color-important) 35%, transparent);
	}

	.lane-band[data-lane='2'] {
		background: color-mix(in srgb, var(--color-text-muted) 35%, transparent);
	}

	.columns {
		flex: 1;
		min-width: 0;
		display: grid;
		grid-template-columns: 1fr;
		gap: 0.75rem;
	}

	.main-column,
	.histoire-column {
		display: flex;
		flex-direction: column;
		gap: 0.625rem;
	}

	.histoire-column {
		padding-left: 0.75rem;
		border-left: 1px solid var(--hairline);
	}

	@media (min-width: 768px) {
		.columns {
			grid-template-columns: 1fr 1fr;
		}
	}

	.today-marker {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		margin: 0.5rem 0;
		color: var(--color-accent);
		font-size: 0.9375rem;
		font-weight: 600;
	}

	.today-marker::before,
	.today-marker::after {
		content: '';
		flex: 1;
		height: 2px;
		border-radius: var(--radius-pill);
		background: var(--color-accent);
	}
</style>

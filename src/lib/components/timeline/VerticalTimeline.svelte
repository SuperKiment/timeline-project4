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

	.separator {
		position: sticky;
		top: 0;
		z-index: 1;
		margin: 0 0 0.5rem;
		padding: 0.375rem 0.5rem;
		background: var(--color-bg);
		font-size: 1rem;
		font-weight: 600;
		text-transform: capitalize;
	}

	.separator.year {
		font-size: 1.25rem;
	}

	.row {
		display: flex;
		gap: 0.5rem;
	}

	.lanes {
		flex: none;
		width: calc(3 * 0.5rem);
		display: flex;
		gap: 2px;
	}

	.lane-band {
		width: 4px;
		border-radius: 2px;
		background: var(--color-accent);
	}

	.lane-band[data-lane='1'] {
		background: var(--color-important);
	}

	.lane-band[data-lane='2'] {
		background: var(--color-text-muted);
	}

	.columns {
		flex: 1;
		display: grid;
		grid-template-columns: 1fr;
		gap: 0.75rem;
	}

	.main-column,
	.histoire-column {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.histoire-column {
		background: var(--color-surface);
		border-radius: 0.5rem;
		padding: 0.5rem;
	}

	@media (min-width: 768px) {
		.columns {
			grid-template-columns: 1fr 1fr;
		}
	}

	.today-marker {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		margin: 0.5rem 0;
		color: var(--color-accent);
		font-weight: 600;
	}

	.today-marker::before,
	.today-marker::after {
		content: '';
		flex: 1;
		height: 2px;
		background: var(--color-accent);
	}
</style>

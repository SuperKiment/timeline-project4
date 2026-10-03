<script lang="ts">
	import { resolve } from '$app/paths';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const weekdays = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
	const cells = $derived(data.weeks.flat());
	const hasEntries = $derived(cells.some((c) => c && c.authors.length > 0));
	const calendarPath = resolve('/journal/calendrier');
	// resolve() takes no query string; the month links append `?mois=` to the resolved path.
</script>

<svelte:head>
	<title>Calendrier du journal — Notre timeline</title>
</svelte:head>

<div class="page">
	<h1>Calendrier du journal</h1>

	<!-- eslint-disable svelte/no-navigation-without-resolve -- path is built with resolve(); only the ?mois query is appended -->
	<div class="toolbar">
		<a class="btn" href={`${calendarPath}?mois=${data.prevMonth}`} rel="prev">
			<span aria-hidden="true">←</span> Mois précédent
		</a>
		<h2 class="month"><span class="month-text">{data.label}</span></h2>
		<a class="btn" href={`${calendarPath}?mois=${data.nextMonth}`} rel="next">
			Mois suivant <span aria-hidden="true">→</span>
		</a>
	</div>
	<!-- eslint-enable svelte/no-navigation-without-resolve -->

	<p class="today-link">
		<a class="btn" href={resolve('/journal')}>Journal du jour</a>
	</p>

	<div class="grid pane">
		<div class="weekdays" aria-hidden="true">
			{#each weekdays as wd (wd)}
				<span>{wd}</span>
			{/each}
		</div>
		{#each cells as cell, i (cell?.day ?? `pad-${i}`)}
			{#if cell}
				<a
					class="cell"
					class:today={cell.isToday}
					class:empty={cell.authors.length === 0}
					href={resolve('/journal/[date]', { date: cell.day })}
					data-day={cell.day}
					aria-current={cell.isToday ? 'date' : undefined}
				>
					<span class="num">{cell.dayNumber}<span class="month-name"> {data.monthName}</span></span>
					<span class="markers">
						{#each cell.authors as author (author.userId)}
							<span
								class="marker author-{author.userId % 2}"
								role="img"
								aria-label={`${author.displayName} a écrit`}
								title={author.displayName}
								data-author={author.displayName}>{author.initial}</span
							>
						{/each}
					</span>
				</a>
			{:else}
				<span class="pad"></span>
			{/if}
		{/each}
	</div>

	{#if !hasEntries}
		<p class="muted no-entries">Aucune entrée de journal ce mois-ci.</p>
	{/if}
</div>

<style>
	h1 {
		margin-bottom: 1rem;
	}

	.toolbar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
	}

	.month {
		flex: 1 1 100%;
		order: -1;
		text-align: center;
	}

	.month-text {
		display: block;
	}

	.month-text::first-letter {
		text-transform: uppercase;
	}

	.toolbar .btn {
		flex: 1 1 0;
	}

	.today-link {
		margin: 0.75rem 0 1rem;
	}

	.muted {
		color: var(--color-text-muted);
	}

	.grid {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.weekdays,
	.pad {
		display: none;
	}

	.cell {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
		min-height: 44px;
		padding: 0.5rem 0.75rem;
		border: 1px solid var(--hairline);
		border-radius: var(--radius-md);
		background: transparent;
		color: var(--color-text);
		text-decoration: none;
		transition: background-color 120ms ease;
	}

	.cell:hover {
		background: var(--surface-strong);
	}

	.cell.today {
		border-color: var(--color-accent);
		box-shadow: 0 0 0 1px var(--color-accent);
	}

	/* Below 768px: only days having entries, as a list. */
	.cell.empty {
		display: none;
	}

	.num {
		font-weight: 600;
	}

	.markers {
		display: inline-flex;
		gap: 0.25rem;
	}

	.marker {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 1.75rem;
		height: 1.75rem;
		border-radius: 50%;
		font-size: 0.8rem;
		font-weight: 700;
		/* White on the dark light-mode author colors, --bg-base on the light dark-mode ones. */
		color: var(--color-accent-contrast);
	}

	.author-0 {
		background: var(--author-a);
	}

	.author-1 {
		background: var(--author-b);
	}

	@media (min-width: 768px) {
		.toolbar .btn {
			flex: 0 0 auto;
		}

		.month {
			flex: 1 1 0;
			order: 0;
		}

		.grid {
			display: grid;
			grid-template-columns: repeat(7, minmax(0, 1fr));
			gap: 0.25rem;
		}

		.weekdays {
			display: contents;
			font-size: 0.8125rem;
			font-weight: 600;
			color: var(--color-text-muted);
			text-align: center;
		}

		.pad {
			display: block;
		}

		.cell,
		.cell.empty {
			display: flex;
			flex-direction: column;
			align-items: flex-start;
			justify-content: space-between;
			min-height: 5.5rem;
		}

		.cell.empty {
			border-color: transparent;
		}

		.month-name {
			display: none;
		}
	}
</style>

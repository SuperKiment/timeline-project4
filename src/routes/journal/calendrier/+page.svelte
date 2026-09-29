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

<h1>Calendrier du journal</h1>

<!-- eslint-disable svelte/no-navigation-without-resolve -- path is built with resolve(); only the ?mois query is appended -->
<div class="toolbar">
	<a class="btn" href={`${calendarPath}?mois=${data.prevMonth}`} rel="prev">
		<span aria-hidden="true">←</span> Mois précédent
	</a>
	<h2 class="month">{data.label}</h2>
	<a class="btn" href={`${calendarPath}?mois=${data.nextMonth}`} rel="next">
		Mois suivant <span aria-hidden="true">→</span>
	</a>
</div>
<!-- eslint-enable svelte/no-navigation-without-resolve -->

<p>
	<a class="btn" href={resolve('/journal')}>Journal du jour</a>
</p>

<div class="grid">
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

<style>
	.toolbar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 0.5rem;
	}

	.month {
		margin: 0;
		font-size: 1.25rem;
		text-transform: capitalize;
	}

	.btn {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		min-height: 44px;
		padding: 0 0.75rem;
		border: 1px solid var(--color-border);
		border-radius: 0.5rem;
		background: var(--color-surface);
		color: var(--color-text);
		text-decoration: none;
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
		border: 1px solid var(--color-border);
		border-radius: 0.5rem;
		background: var(--color-surface);
		color: var(--color-text);
		text-decoration: none;
	}

	.cell.today {
		border-color: var(--color-accent);
		border-width: 2px;
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
		color: #fff;
	}

	.author-0 {
		background: #b45309;
	}

	.author-1 {
		background: #0f766e;
	}

	@media (min-width: 768px) {
		.grid {
			display: grid;
			grid-template-columns: repeat(7, minmax(0, 1fr));
			gap: 0.25rem;
		}

		.weekdays {
			display: contents;
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
			border-radius: 0.375rem;
		}

		.cell.empty {
			background: transparent;
		}

		.month-name {
			display: none;
		}
	}
</style>

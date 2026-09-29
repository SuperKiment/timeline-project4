<script lang="ts">
	import { goto } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { typesToParam } from '../../timeline/prefs';
	import { ENTRY_TYPES, type EntryType } from '../../timeline/types';

	let { selected }: { selected: EntryType[] } = $props();

	const LABELS: Record<EntryType, string> = {
		souvenir: 'Souvenirs',
		important: 'Importants',
		phase: 'Phases',
		recurrent: 'Récurrents',
		histoire: 'Histoire'
	};

	function toggle(type: EntryType) {
		const isOn = selected.includes(type);
		// Keep at least one type visible: an empty selection would mean "all" in the URL.
		if (isOn && selected.length === 1) return;
		const next = isOn ? selected.filter((t) => t !== type) : [...selected, type];
		const param = typesToParam(next);
		const path = resolve('/');
		// eslint-disable-next-line svelte/no-navigation-without-resolve -- the path is built with resolve(); only the query string is appended
		goto(param ? `${path}?types=${param}` : path, {
			keepFocus: true,
			noScroll: true,
			replaceState: true
		});
	}
</script>

<div class="type-filters" role="group" aria-label="Types d'éléments">
	{#each ENTRY_TYPES as type (type)}
		<button
			type="button"
			class="chip"
			aria-pressed={selected.includes(type)}
			onclick={() => toggle(type)}
		>
			{LABELS[type]}
		</button>
	{/each}
</div>

<style>
	.type-filters {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.chip {
		min-height: 44px;
		padding: 0 0.875rem;
		border: 1px solid var(--color-border);
		border-radius: 999px;
		background: var(--color-bg);
		color: var(--color-text-muted);
		cursor: pointer;
	}

	.chip[aria-pressed='true'] {
		background: var(--color-accent);
		border-color: var(--color-accent);
		color: var(--color-accent-contrast);
		font-weight: 600;
	}
</style>

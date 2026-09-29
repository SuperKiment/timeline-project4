<script lang="ts">
	import type { TimelineView } from '../../timeline/prefs';

	let { view, onchange }: { view: TimelineView; onchange: (view: TimelineView) => void } = $props();

	const OPTIONS: { value: TimelineView; label: string }[] = [
		{ value: 'vertical', label: 'Vertical' },
		{ value: 'horizontal', label: 'Horizontal' }
	];
</script>

<div class="view-toggle" role="group" aria-label="Affichage de la timeline">
	{#each OPTIONS as option (option.value)}
		<button
			type="button"
			aria-pressed={view === option.value}
			onclick={() => onchange(option.value)}
		>
			{option.label}
		</button>
	{/each}
</div>

<style>
	.view-toggle {
		display: inline-flex;
		border: 1px solid var(--color-border);
		border-radius: 0.5rem;
		overflow: hidden;
	}

	button {
		min-height: 44px;
		padding: 0 0.875rem;
		border: none;
		background: var(--color-bg);
		color: var(--color-text-muted);
		cursor: pointer;
	}

	button[aria-pressed='true'] {
		background: var(--color-accent);
		color: var(--color-accent-contrast);
		font-weight: 600;
	}
</style>

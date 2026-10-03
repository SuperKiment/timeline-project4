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
		gap: 2px;
		padding: 4px;
		border: 1px solid var(--color-border);
		border-radius: var(--radius-pill);
		background: var(--surface-strong);
	}

	button {
		min-height: 44px;
		padding: 0 1rem;
		border: none;
		background: transparent;
		color: var(--color-text-muted);
		font-size: 0.9375rem;
	}

	button[aria-pressed='true'] {
		background: var(--glass-bg);
		color: var(--color-accent);
		box-shadow: var(--shadow-pane);
	}
</style>

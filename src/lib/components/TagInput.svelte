<script lang="ts">
	import { untrack } from 'svelte';
	import { mergeTags } from '../timeline/entry-form';

	let {
		name = 'tags',
		tags: initialTags = [],
		label = 'Tags'
	}: {
		name?: string;
		/** Initial tags; the component owns the state afterwards. */
		tags?: string[];
		label?: string;
	} = $props();

	let tags = $state<string[]>(untrack(() => mergeTags(initialTags, '')));
	let draft = $state('');

	// A tag typed but not yet committed (no Enter/comma) is still submitted through
	// the hidden field. Nothing is committed on blur: that would shift the layout
	// under a submit click and lose it.
	const submitted = $derived(mergeTags(tags, draft));

	function commit() {
		tags = mergeTags(tags, draft);
		draft = '';
	}

	function onkeydown(event: KeyboardEvent) {
		if (event.key === 'Enter' || event.key === ',') {
			event.preventDefault();
			commit();
		} else if (event.key === 'Backspace' && draft === '' && tags.length > 0) {
			tags = tags.slice(0, -1);
		}
	}

	function remove(tag: string) {
		tags = tags.filter((t) => t !== tag);
	}
</script>

<div class="tag-input">
	<label class="label" for="{name}-draft">{label}</label>
	{#if tags.length > 0}
		<ul class="chips">
			{#each tags as tag (tag)}
				<li class="chip">
					<span>{tag}</span>
					<button type="button" aria-label="Retirer le tag {tag}" onclick={() => remove(tag)}>
						×
					</button>
				</li>
			{/each}
		</ul>
	{/if}
	<input
		id="{name}-draft"
		type="text"
		bind:value={draft}
		{onkeydown}
		placeholder="Ajouter un tag (virgule ou Entrée)"
		autocomplete="off"
	/>
	<input type="hidden" {name} value={JSON.stringify(submitted)} />
</div>

<style>
	.tag-input {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.label {
		font-weight: 600;
	}

	.chips {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		list-style: none;
		margin: 0;
		padding: 0;
	}

	.chip {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		padding-left: 0.75rem;
		border: 1px solid var(--color-border);
		border-radius: 999px;
		background: var(--color-surface);
	}

	.chip button {
		min-width: 44px;
		border: none;
		background: transparent;
		color: var(--color-text);
		font-size: 1.25rem;
		cursor: pointer;
	}
</style>

<script lang="ts">
	import { untrack } from 'svelte';
	import FuzzyDateInput from './FuzzyDateInput.svelte';
	import TagInput from './TagInput.svelte';
	import type { EntryFormValues } from '../timeline/entry-form';
	import type { EntryType } from '../timeline/types';

	const uid = $props.id();

	let {
		values,
		errors = {},
		submitLabel
	}: {
		values: EntryFormValues;
		/** Per-field French messages returned by `validateEntryInput`. */
		errors?: Partial<Record<string, string>>;
		submitLabel: string;
	} = $props();

	const TYPE_LABELS: Record<EntryType, string> = {
		souvenir: 'Souvenir',
		important: 'Important',
		phase: 'Phase',
		recurrent: 'Récurrent',
		histoire: 'Histoire'
	};

	let type = $state(untrack(() => values.type));

	const isRecurrent = $derived(type === 'recurrent');
	const hasEnd = $derived(type === 'phase' || type === 'histoire' || type === 'recurrent');
	const startPrecisions = $derived(
		isRecurrent ? (['day'] as const) : (['day', 'month', 'year'] as const)
	);
	const endLabel = $derived(
		isRecurrent ? 'Fin de la série (optionnelle)' : 'Fin (vide = en cours)'
	);
</script>

<form method="POST" novalidate class="pane">
	<div class="field">
		<label class="label" for="{uid}-type">Type</label>
		<select id="{uid}-type" name="type" bind:value={type}>
			{#each Object.entries(TYPE_LABELS) as [t, text] (t)}
				<option value={t}>{text}</option>
			{/each}
		</select>
		{#if errors.type}<p class="error" role="alert">{errors.type}</p>{/if}
	</div>

	<div class="field">
		<FuzzyDateInput
			name="start"
			label={isRecurrent ? "Date d'origine" : 'Début'}
			required
			allowedPrecisions={startPrecisions}
			fields={values.start}
		/>
		{#if errors.start}<p class="error" role="alert">{errors.start}</p>{/if}
	</div>

	{#if hasEnd}
		<div class="field">
			<FuzzyDateInput
				name="end"
				label={endLabel}
				allowedPrecisions={startPrecisions}
				fields={values.end}
			/>
			{#if errors.end}<p class="error" role="alert">{errors.end}</p>{/if}
		</div>
	{/if}

	{#if isRecurrent}
		<div class="field">
			<label class="label" for="{uid}-freq">Fréquence</label>
			<select id="{uid}-freq" name="recurrenceFreq" value={values.recurrenceFreq}>
				<option value="yearly">Annuel</option>
				<option value="monthly">Mensuel</option>
			</select>
			{#if errors.recurrenceFreq}<p class="error" role="alert">{errors.recurrenceFreq}</p>{/if}
		</div>
	{/if}

	<div class="field">
		<label class="label" for="{uid}-title">Titre <span aria-hidden="true">*</span></label>
		<input id="{uid}-title" class="title" type="text" name="title" value={values.title} required />
		{#if errors.title}<p class="error" role="alert">{errors.title}</p>{/if}
	</div>

	<div class="field">
		<label class="label" for="{uid}-description">Description</label>
		<textarea
			id="{uid}-description"
			name="description"
			rows="6"
			value={values.description}
			aria-describedby="{uid}-description-hint"></textarea>
		<span class="hint" id="{uid}-description-hint"
			>Markdown léger : **gras**, *italique*, listes, liens.</span
		>
	</div>

	<div class="field">
		<label class="label" for="{uid}-location">Lieu</label>
		<input id="{uid}-location" type="text" name="location" value={values.location} />
	</div>

	<TagInput name="tags" tags={values.tags} />

	<button type="submit">{submitLabel}</button>
</form>

<style>
	form {
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: 0.375rem;
	}

	.label {
		font-size: 0.9375rem;
		font-weight: 600;
	}

	.hint {
		font-size: 0.8125rem;
		color: var(--color-text-muted);
	}

	.error {
		margin: 0;
		font-size: 0.9375rem;
		color: var(--color-danger);
	}

	.title {
		font-family: var(--font-serif);
		font-size: 1.125rem;
	}

	textarea {
		font-family: var(--font-serif);
		font-size: 1.125rem;
		line-height: 1.65;
		resize: vertical;
	}

	button[type='submit'] {
		align-self: flex-start;
	}

	@media (max-width: 479px) {
		button[type='submit'] {
			align-self: stretch;
		}
	}
</style>

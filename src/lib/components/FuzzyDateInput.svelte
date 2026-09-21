<script lang="ts">
	import { FRENCH_MONTHS, PRECISIONS, type FuzzyDate, type Precision } from '../dates/fuzzy';
	import {
		fuzzyFormFieldsToValue,
		resolveInitialFields,
		resolvePrecision,
		type FuzzyFormFields
	} from '../dates/fuzzy-form';

	let {
		name,
		value = $bindable(null),
		label,
		required = false,
		allowedPrecisions = PRECISIONS,
		fields
	}: {
		name: string;
		value?: FuzzyDate | null;
		label: string;
		required?: boolean;
		allowedPrecisions?: readonly Precision[];
		/** Raw fields to refill after a `fail(400)` re-render; takes precedence over `value`. */
		fields?: FuzzyFormFields;
	} = $props();

	const PRECISION_LABELS: Record<Precision, string> = {
		day: 'Jour',
		month: 'Mois',
		year: 'Année'
	};

	// Wrapped in functions (rather than referenced inline) so the initial
	// snapshot is unambiguous to the compiler: `fields`/`value`/
	// `allowedPrecisions` are only meant to seed the local editable state
	// below, not to be tracked reactively afterwards.
	function computeInitialFields(): FuzzyFormFields {
		return resolveInitialFields(fields, value);
	}
	const initialFields = computeInitialFields();

	function computeInitialPrecision(): Precision {
		return resolvePrecision(initialFields.precision, allowedPrecisions);
	}

	let precision = $state<Precision>(computeInitialPrecision());
	let year = $state(initialFields.year);
	let month = $state(initialFields.month);
	let day = $state(initialFields.day);

	// Falls back to the first allowed precision if the current one becomes
	// unavailable (e.g. `allowedPrecisions` narrowed by a parent after mount).
	$effect(() => {
		if (!allowedPrecisions.includes(precision)) {
			precision = allowedPrecisions[0];
		}
	});

	// Keeps the bindable `value` in sync as the parsed structured date, or
	// `null` while the raw fields are incomplete/invalid. The hidden inputs
	// below (parsed server-side via `parseFuzzyFormFields`) remain the source
	// of truth for submission.
	$effect(() => {
		value = fuzzyFormFieldsToValue({ precision, year, month, day });
	});
</script>

<fieldset class="fuzzy-date-input">
	<legend
		>{label}{#if required}<span aria-hidden="true"> *</span>{/if}</legend
	>

	{#if allowedPrecisions.length > 1}
		<div class="precision-control" role="radiogroup" aria-label="Précision de la date">
			{#each allowedPrecisions as p (p)}
				<label class="precision-option" class:selected={precision === p}>
					<input type="radio" name="{name}-precision-choice" bind:group={precision} value={p} />
					{PRECISION_LABELS[p]}
				</label>
			{/each}
		</div>
	{/if}

	<div class="fields">
		<label class="field">
			<span>Année</span>
			<input
				type="text"
				inputmode="numeric"
				pattern="[0-9]*"
				bind:value={year}
				{required}
				aria-label="Année"
			/>
		</label>

		{#if precision === 'month' || precision === 'day'}
			<label class="field">
				<span>Mois</span>
				<select bind:value={month} {required} aria-label="Mois">
					<option value="" disabled>—</option>
					{#each FRENCH_MONTHS as monthName, i (monthName)}
						<option value={String(i + 1)}>{monthName}</option>
					{/each}
				</select>
			</label>
		{/if}

		{#if precision === 'day'}
			<label class="field">
				<span>Jour</span>
				<input
					type="text"
					inputmode="numeric"
					pattern="[0-9]*"
					bind:value={day}
					{required}
					aria-label="Jour"
				/>
			</label>
		{/if}
	</div>

	<input type="hidden" name="{name}_precision" value={precision} />
	<input type="hidden" name="{name}_year" value={year} />
	<input type="hidden" name="{name}_month" value={month} />
	<input type="hidden" name="{name}_day" value={day} />
</fieldset>

<style>
	.fuzzy-date-input {
		border: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	legend {
		font-weight: 600;
		padding: 0;
	}

	.precision-control {
		display: inline-flex;
		border: 1px solid var(--color-border);
		border-radius: 0.5rem;
		overflow: hidden;
		width: fit-content;
	}

	.precision-option {
		position: relative;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		min-height: 44px;
		min-width: 44px;
		padding: 0 0.75rem;
		cursor: pointer;
		background: var(--color-surface);
		color: var(--color-text);
	}

	.precision-option + .precision-option {
		border-left: 1px solid var(--color-border);
	}

	.precision-option.selected {
		background: var(--color-accent);
		color: var(--color-accent-contrast);
	}

	.precision-option input[type='radio'] {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
		white-space: nowrap;
	}

	.fields {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		min-width: 6rem;
	}

	.field span {
		font-size: 0.875rem;
		color: var(--color-text-muted);
	}
</style>

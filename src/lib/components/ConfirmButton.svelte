<script lang="ts">
	import type { Snippet } from 'svelte';

	/**
	 * Button that asks for confirmation in a native <dialog> before acting.
	 *
	 * Props:
	 * - `label`        button text (or use `children` snippet instead)
	 * - `confirmText`  question shown in the dialog (default "Mettre à la corbeille ?")
	 * - `onconfirm`    optional callback run on "Confirmer". When given, no form is
	 *                  submitted (use for fetch-based actions, e.g. DELETE /api/media/<id>).
	 *                  Otherwise the enclosing <form> is submitted with `requestSubmit()`,
	 *                  so `use:enhance` keeps working.
	 * - `formaction`, `name`, `value`  forwarded as the submitter's attributes so the
	 *                  right action (e.g. `?/delete`) is used; only used without `onconfirm`.
	 * - Note: without `onconfirm` the trigger is a real `type="submit"` button (required
	 *                  for `requestSubmit(submitter)`); its click is always intercepted to open
	 *                  the dialog. If it is the FIRST submit button of the form, pressing Enter
	 *                  in a text field "clicks" it, which opens the dialog (never bypasses it)
	 *                  but would steal Enter from the primary action: put the primary submit
	 *                  button before it in the DOM, or keep it in its own <form>.
	 * - `class`        extra class on the trigger button (a `danger` class is applied by default).
	 */
	let {
		label = '',
		confirmText = 'Mettre à la corbeille ?',
		onconfirm,
		formaction,
		name,
		value,
		class: className = '',
		children
	}: {
		label?: string;
		confirmText?: string;
		onconfirm?: () => void | Promise<void>;
		formaction?: string;
		name?: string;
		value?: string;
		class?: string;
		children?: Snippet;
	} = $props();

	let trigger: HTMLButtonElement | undefined = $state();
	let dialog: HTMLDialogElement | undefined = $state();

	function open(event?: MouseEvent) {
		// Submit-type trigger: never submit on click, only after "Confirmer".
		event?.preventDefault();
		dialog?.showModal();
	}

	function cancel() {
		dialog?.close();
	}

	function confirm() {
		dialog?.close();
		if (onconfirm) {
			void onconfirm();
			return;
		}
		const form = trigger?.form;
		if (!form) {
			console.error('ConfirmButton: aucun formulaire parent et pas de onconfirm.');
			return;
		}
		// Submitter carries formaction/name/value like a real button click would.
		form.requestSubmit(trigger);
	}
</script>

<button
	bind:this={trigger}
	type={onconfirm ? 'button' : 'submit'}
	class="trigger danger {className}"
	{formaction}
	{name}
	{value}
	onclick={open}
>
	{#if children}{@render children()}{:else}{label}{/if}
</button>

<dialog bind:this={dialog} class="confirm-dialog" aria-label={confirmText}>
	<p>{confirmText}</p>
	<div class="actions">
		<button type="button" class="cancel" onclick={cancel}>Annuler</button>
		<button type="button" class="confirm" onclick={confirm}>Confirmer</button>
	</div>
</dialog>

<style>
	.trigger {
		border-color: color-mix(in srgb, var(--color-danger) 35%, transparent);
		background: var(--surface-strong);
		color: var(--color-danger);
	}

	.confirm-dialog {
		max-width: min(90vw, 24rem);
		padding: 1.5rem;
		border: 1px solid var(--glass-border);
		border-radius: var(--radius-xl);
		background: var(--glass-bg);
		-webkit-backdrop-filter: var(--blur);
		backdrop-filter: var(--blur);
		box-shadow: var(--shadow-float);
		color: var(--color-text);
	}

	/* Dim only: a full-viewport blur is the costliest filter, while the small
	   panel above keeps its glass blur. */
	.confirm-dialog::backdrop {
		background: rgb(0 0 0 / 0.35);
	}

	p {
		margin: 0 0 1.25rem;
		font-weight: 600;
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		justify-content: flex-end;
		gap: 0.5rem;
	}

	.actions .confirm {
		background: var(--color-danger);
		border-color: var(--color-danger);
		color: white;
	}
</style>

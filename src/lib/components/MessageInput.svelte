<script lang="ts">
	let {
		busy,
		disabled,
		value = $bindable(''),
		onsend,
		onstop
	}: {
		busy: boolean;
		disabled: boolean;
		value?: string;
		onsend: (text: string) => void;
		onstop: () => void;
	} = $props();

	function submit() {
		const text = value.trim();
		if (!text || busy || disabled) return;
		value = '';
		onsend(text);
	}

	function onkeydown(event: KeyboardEvent) {
		if (event.key === 'Enter' && !event.shiftKey) {
			event.preventDefault();
			submit();
		}
	}
</script>

<form
	onsubmit={(event) => {
		event.preventDefault();
		submit();
	}}
>
	<!-- Stays editable while busy so you can type ahead; submit() ignores Enter. -->
	<textarea
		bind:value
		{onkeydown}
		rows="1"
		placeholder={disabled ? 'Konfigurera en API-nyckel för att börja chatta' : 'Fråga om middag…'}
		{disabled}></textarea>
	{#if busy}
		<button type="button" class="stop" onclick={onstop}>Stopp</button>
	{/if}
	<button type="submit" disabled={busy || disabled || value.trim() === ''}>Skicka</button>
</form>

<style>
	form {
		display: flex;
		gap: var(--space-2);
		align-items: flex-end;
		/* Auto margins disable flex stretch, so claim the width explicitly:
		   without it the form shrink-wraps and the row shifts while typing. */
		width: 100%;
		max-width: 52rem;
		margin: 0 auto;
		padding: var(--space-3) var(--space-4);
	}

	textarea {
		flex: 1;
		/* Keep the width flex-controlled so field-sizing only grows the height. */
		min-width: 0;
		resize: none;
		field-sizing: content;
		max-height: 10rem;
		font: inherit;
		color: inherit;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 0.6rem 0.9rem;
	}

	button {
		/* Don't let a growing textarea squeeze or displace the button. */
		flex-shrink: 0;
		font: inherit;
		font-weight: 600;
		border: none;
		border-radius: var(--radius);
		padding: 0.6rem 1.1rem;
		background: var(--accent);
		color: var(--accent-contrast);
		cursor: pointer;
	}

	button:disabled {
		opacity: 0.5;
		cursor: default;
	}

	/* Two buttons plus the field is a tight fit on a phone; claw back the
	   padding so the placeholder still fits on one line. */
	@media (max-width: 480px) {
		button {
			padding: 0.6rem 0.7rem;
		}
	}

	.stop {
		background: var(--surface);
		color: var(--text);
		border: 1px solid var(--border);
	}
</style>

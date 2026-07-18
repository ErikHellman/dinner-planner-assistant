<script lang="ts">
	let {
		busy,
		disabled,
		onsend,
		onstop
	}: {
		busy: boolean;
		disabled: boolean;
		onsend: (text: string) => void;
		onstop: () => void;
	} = $props();

	let text = $state('');

	function submit() {
		const value = text.trim();
		if (!value || busy || disabled) return;
		text = '';
		onsend(value);
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
	<textarea
		bind:value={text}
		{onkeydown}
		rows="1"
		placeholder={disabled ? 'Configure an API key to start chatting' : 'Ask about dinner…'}
		{disabled}></textarea>
	{#if busy}
		<button type="button" class="stop" onclick={onstop}>Stop</button>
	{:else}
		<button type="submit" disabled={disabled || text.trim() === ''}>Send</button>
	{/if}
</form>

<style>
	form {
		display: flex;
		gap: 0.5rem;
		align-items: flex-end;
		/* Auto margins disable flex stretch, so claim the width explicitly:
		   without it the form shrink-wraps and the row shifts while typing. */
		width: 100%;
		max-width: 52rem;
		margin: 0 auto;
		padding: 0.75rem 1rem calc(0.75rem + env(safe-area-inset-bottom));
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

	textarea:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: -1px;
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

	.stop {
		background: var(--surface);
		color: var(--text);
		border: 1px solid var(--border);
	}
</style>

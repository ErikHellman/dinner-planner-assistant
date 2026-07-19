<script lang="ts">
	import type { ChatMessage } from '$lib/chat/types';

	let { message, streaming = false }: { message: ChatMessage; streaming?: boolean } = $props();
</script>

<div class="message {message.role}" class:error={message.error}>
	{message.content}{#if streaming}<span class="caret" aria-hidden="true">▍</span>{/if}
</div>

<style>
	.message {
		max-width: min(85%, 48rem);
		padding: 0.6rem 0.9rem;
		border-radius: var(--radius);
		white-space: pre-wrap;
		overflow-wrap: anywhere;
		line-height: 1.5;
	}

	.user {
		align-self: flex-end;
		background: var(--accent);
		color: var(--accent-contrast);
		border-bottom-right-radius: 4px;
	}

	.assistant {
		align-self: flex-start;
		background: var(--surface);
		border: 1px solid var(--border);
		border-bottom-left-radius: 4px;
	}

	.error {
		border-color: var(--error);
		color: var(--error);
	}

	/* Marks the message as unfinished — more output is still coming. */
	.caret {
		animation: blink 1s step-end infinite;
	}

	@keyframes blink {
		50% {
			opacity: 0;
		}
	}
</style>

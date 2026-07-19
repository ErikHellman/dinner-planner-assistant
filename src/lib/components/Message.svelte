<script lang="ts">
	import { renderMarkdown } from '$lib/chat/markdown';
	import type { ChatMessage } from '$lib/chat/types';

	let { message, streaming = false }: { message: ChatMessage; streaming?: boolean } = $props();

	// Only the agent writes markdown. What the user typed stays literal, and
	// error text is our own copy — neither should be reinterpreted as markup.
	const formatted = $derived(message.role === 'assistant' && !message.error);
	const html = $derived(formatted ? renderMarkdown(message.content) : '');
</script>

<div class="message {message.role}" class:error={message.error} class:markdown={formatted}>
	<!-- `html` is DOMPurify output from renderMarkdown; content is never raw. -->
	<!-- eslint-disable-next-line svelte/no-at-html-tags -->
	{#if formatted}{@html html}{:else}{message.content}{/if}{#if streaming}<span
			class="caret"
			aria-hidden="true">▍</span
		>{/if}
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

	/* Block elements carry their own spacing, so pre-wrap would double it. */
	.markdown {
		white-space: normal;
	}

	/* {@html} output isn't touched by scoped styles, hence :global. Margins are
	   collapsed at the bubble's edges so a message doesn't sit in dead space. */
	.markdown :global(> :first-child) {
		margin-top: 0;
	}

	.markdown :global(> :last-child) {
		margin-bottom: 0;
	}

	.markdown :global(p),
	.markdown :global(ul),
	.markdown :global(ol),
	.markdown :global(pre),
	.markdown :global(table) {
		margin: 0 0 0.75em;
	}

	.markdown :global(h1),
	.markdown :global(h2),
	.markdown :global(h3),
	.markdown :global(h4) {
		margin: 1em 0 0.4em;
		font-size: 1.05em;
		line-height: 1.3;
	}

	.markdown :global(ul),
	.markdown :global(ol) {
		padding-left: 1.4em;
	}

	.markdown :global(li) {
		margin-bottom: 0.2em;
	}

	.markdown :global(code) {
		font-family: ui-monospace, monospace;
		font-size: 0.9em;
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: 4px;
		padding: 0.1em 0.3em;
	}

	.markdown :global(pre) {
		/* Long code lines scroll inside the bubble instead of widening it. */
		overflow-x: auto;
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 0.6rem 0.8rem;
	}

	.markdown :global(pre code) {
		background: none;
		border: none;
		padding: 0;
	}

	.markdown :global(table) {
		border-collapse: collapse;
		/* Price tables are the wide case; let them scroll, not overflow. */
		display: block;
		overflow-x: auto;
		font-size: 0.95em;
	}

	.markdown :global(th),
	.markdown :global(td) {
		border: 1px solid var(--border);
		padding: 0.3em 0.6em;
		text-align: left;
		white-space: nowrap;
	}

	.markdown :global(blockquote) {
		margin: 0 0 0.75em;
		padding-left: 0.8em;
		border-left: 3px solid var(--border);
		color: var(--muted);
	}

	.markdown :global(a) {
		color: inherit;
		text-decoration: underline;
	}

	.markdown :global(hr) {
		border: none;
		border-top: 1px solid var(--border);
		margin: 0.9em 0;
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

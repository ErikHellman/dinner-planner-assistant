<script lang="ts">
	import type { ChatMessage } from '$lib/chat/types';
	import Message from './Message.svelte';

	let { messages, streaming }: { messages: ChatMessage[]; streaming: boolean } = $props();

	let viewport = $state<HTMLElement>();

	$effect(() => {
		// Reading length and the tail content registers them as dependencies,
		// so the list follows the stream as deltas arrive.
		if (messages.length > 0 || messages.at(-1)?.content !== undefined) {
			viewport?.scrollTo({ top: viewport.scrollHeight });
		}
	});
</script>

<div class="viewport" bind:this={viewport}>
	{#if messages.length === 0}
		<div class="empty">
			<p class="title">Vad blir det till middag?</p>
			<p>Be om middagsidéer, recept eller hjälp att planera veckan.</p>
		</div>
	{:else}
		<div class="list">
			<!-- The caret on the last assistant message says "unfinished"; what the
			     agent is doing is spelled out in the status row above the input. -->
			{#each messages as message, i (i)}
				<Message
					{message}
					streaming={streaming && i === messages.length - 1 && message.role === 'assistant'}
				/>
			{/each}
		</div>
	{/if}
</div>

<style>
	.viewport {
		flex: 1;
		overflow-y: auto;
		padding: 1rem;
	}

	.list {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		max-width: 52rem;
		margin: 0 auto;
	}

	.empty {
		height: 100%;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 0.25rem;
		color: var(--muted);
		text-align: center;
	}

	.empty .title {
		font-size: 1.4rem;
		font-weight: 600;
		color: var(--text);
	}
</style>

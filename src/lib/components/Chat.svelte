<script lang="ts">
	import { onMount } from 'svelte';
	import { ChatStore } from '$lib/chat/chat.svelte';
	import MessageInput from './MessageInput.svelte';
	import MessageList from './MessageList.svelte';

	interface Health {
		provider: string;
		model: string;
		apiKeyVar: string;
		apiKeyConfigured: boolean;
	}

	const chat = new ChatStore();
	let health = $state<Health | null>(null);

	onMount(async () => {
		const res = await fetch('/api/health');
		if (res.ok) health = (await res.json()) as Health;
	});

	// Optimistic until health arrives; the chat endpoint reports the same error anyway.
	const configured = $derived(health?.apiKeyConfigured ?? true);
</script>

<div class="chat">
	<header>
		<h1>Dinner Planner</h1>
		<div class="controls">
			{#if health}
				<span class="model">{health.provider}/{health.model}</span>
			{/if}
			<button onclick={() => chat.newChat()} disabled={chat.messages.length === 0}>
				New chat
			</button>
		</div>
	</header>

	{#if !configured && health}
		<div class="banner" role="alert">
			No API key configured. Set <code>{health.apiKeyVar}</code> in <code>.env</code> (see
			<code>.env.example</code>) and restart the server.
		</div>
	{/if}

	<MessageList messages={chat.messages} streaming={chat.busy} />

	<MessageInput
		busy={chat.busy}
		disabled={!configured}
		onsend={(text) => chat.send(text)}
		onstop={() => chat.stop()}
	/>
</div>

<style>
	.chat {
		height: 100dvh;
		display: flex;
		flex-direction: column;
	}

	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		padding: 0.75rem 1rem;
		border-bottom: 1px solid var(--border);
		background: var(--surface);
	}

	h1 {
		font-size: 1.1rem;
		margin: 0;
	}

	.controls {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.model {
		color: var(--muted);
		font-size: 0.8rem;
	}

	header button {
		font: inherit;
		font-size: 0.9rem;
		background: none;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 0.35rem 0.8rem;
		color: var(--text);
		cursor: pointer;
	}

	header button:disabled {
		opacity: 0.5;
		cursor: default;
	}

	.banner {
		background: var(--error-bg);
		color: var(--error);
		padding: 0.6rem 1rem;
		text-align: center;
		font-size: 0.9rem;
	}

	.banner code {
		font-family: ui-monospace, monospace;
	}

	@media (max-width: 480px) {
		.model {
			display: none;
		}
	}
</style>

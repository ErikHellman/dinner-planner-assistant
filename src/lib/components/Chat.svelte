<script lang="ts">
	import { onMount } from 'svelte';
	import { chat } from '$lib/chat/store.svelte';
	import MessageInput from './MessageInput.svelte';
	import MessageList from './MessageList.svelte';

	interface Health {
		provider: string;
		model: string;
		apiKeyVar: string;
		apiKeyConfigured: boolean;
	}

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
		<h1>Planera</h1>
		<div class="controls">
			{#if health}
				<span class="model">{health.provider}/{health.model}</span>
			{/if}
			<button onclick={() => chat.newChat()} disabled={chat.messages.length === 0}>
				Ny chatt
			</button>
		</div>
	</header>

	{#if !configured && health}
		<div class="banner" role="alert">
			Ingen API-nyckel konfigurerad. Ange <code>{health.apiKeyVar}</code> i <code>.env</code> (se
			<code>.env.example</code>) och starta om servern.
		</div>
	{/if}

	<MessageList messages={chat.messages} streaming={chat.busy} activity={chat.activity} />

	<MessageInput
		busy={chat.busy}
		disabled={!configured}
		bind:value={chat.draft}
		onsend={(text) => chat.send(text)}
		onstop={() => chat.stop()}
	/>
</div>

<style>
	.chat {
		flex: 1;
		min-height: 0;
		display: flex;
		flex-direction: column;
	}

	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-4);
		padding: var(--space-3) var(--space-4);
		border-bottom: 1px solid var(--border);
		background: var(--surface);
	}

	h1 {
		font-size: var(--text-lg);
		margin: 0;
	}

	.controls {
		display: flex;
		align-items: center;
		gap: var(--space-3);
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
		padding: 0.6rem var(--space-4);
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

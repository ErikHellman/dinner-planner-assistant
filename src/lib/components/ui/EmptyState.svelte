<script lang="ts">
	import type { Snippet } from 'svelte';
	import Icon, { type IconName } from '../icons/Icon.svelte';

	let {
		icon,
		title,
		children
	}: { icon?: IconName; title: string; children?: Snippet } = $props();
</script>

<div class="empty">
	{#if icon}
		<span class="icon"><Icon name={icon} size={36} /></span>
	{/if}
	<p class="title">{title}</p>
	{#if children}
		<div class="body">{@render children()}</div>
	{/if}
</div>

<style>
	.empty {
		height: 100%;
		min-height: 12rem;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: var(--space-2);
		color: var(--muted);
		text-align: center;
		padding: var(--space-6) var(--space-4);
	}

	.icon {
		display: inline-flex;
	}

	.title {
		margin: 0;
		font-size: var(--text-xl);
		font-weight: 600;
		color: var(--text);
	}

	.body {
		max-width: 28rem;
	}
</style>

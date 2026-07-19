<script lang="ts">
	import type { Snippet } from 'svelte';

	let { title, description, children }: { title: string; description?: string; children: Snippet } =
		$props();
</script>

<section>
	<h2>{title}</h2>
	{#if description}
		<p class="description">{description}</p>
	{/if}
	<div class="body">{@render children()}</div>
</section>

<style>
	section {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: var(--space-4);
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}

	h2 {
		margin: 0;
		font-size: var(--text-lg);
	}

	.description {
		margin: 0;
		color: var(--muted);
		font-size: var(--text-sm);
	}

	.body {
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
	}
</style>

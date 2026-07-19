<script lang="ts">
	// Pinned above the input rather than inside the scrolling thread, so it
	// stays visible for the whole turn — including after text has started
	// streaming and while a tool is running.
	let { label }: { label: string | null } = $props();
</script>

<div class="status" role="status" aria-live="polite">
	{#if label}
		<span class="dot" aria-hidden="true"></span>
		<span>{label}</span>
	{/if}
</div>

<style>
	.status {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		/* Reserve the row's height at all times so the input never jumps
		   when the agent starts or stops working. */
		min-height: 1.5rem;
		width: 100%;
		max-width: 52rem;
		margin: 0 auto;
		padding: 0 var(--space-4);
		color: var(--muted);
		font-size: 0.85rem;
	}

	.dot {
		width: 0.5rem;
		height: 0.5rem;
		border-radius: 50%;
		background: currentColor;
		/* Motion, not hue, carries the "still working" signal. */
		animation: pulse 1.2s ease-in-out infinite;
	}

	@keyframes pulse {
		50% {
			opacity: 0.2;
		}
	}
</style>

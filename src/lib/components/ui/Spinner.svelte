<script lang="ts">
	let { label = 'Laddar…', size = 28 }: { label?: string; size?: number } = $props();
</script>

<span class="spinner" style:--size="{size}px" role="status" aria-label={label} title={label}></span>

<style>
	.spinner {
		display: inline-block;
		width: var(--size);
		height: var(--size);
		border-radius: 50%;
		border: 3px solid var(--border);
		border-top-color: var(--accent);
		animation: spin 0.8s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}
</style>

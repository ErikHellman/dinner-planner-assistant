<script lang="ts">
	import type { PlanStatus } from '$lib/plans/types';
	import Icon from '../icons/Icon.svelte';

	let {
		status,
		busy = false,
		onchange
	}: { status: PlanStatus; busy?: boolean; onchange: (next: PlanStatus) => void } = $props();

	const ordered = $derived(status === 'ordered');
	const next = $derived<PlanStatus>(ordered ? 'new' : 'ordered');
</script>

<div class="bar">
	<!-- State is carried by the word and by the check/outline, never by colour. -->
	<span class="badge" class:ordered>
		{#if ordered}<Icon name="check" size={16} />{/if}
		{ordered ? 'Beställd' : 'Ny'}
	</span>

	<button type="button" disabled={busy} onclick={() => onchange(next)}>
		{ordered ? 'Markera som ny' : 'Markera som beställd'}
	</button>
</div>

<style>
	.bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
		flex-wrap: wrap;
	}

	.badge {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		padding: 0.25rem 0.7rem;
		border-radius: 999px;
		font-size: var(--text-sm);
		font-weight: 600;
		/* "Ny" is an outline; "Beställd" is filled and carries a check. The two
		   differ in fill, shape and wording, so they stay distinguishable
		   without relying on hue. */
		border: 1px dashed var(--border);
		color: var(--muted);
	}

	.badge.ordered {
		border: 1px solid var(--accent);
		background: var(--accent);
		color: var(--accent-contrast);
	}

	button {
		font: inherit;
		font-size: var(--text-sm);
		background: none;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 0.35rem 0.8rem;
		color: var(--text);
		cursor: pointer;
	}

	button:disabled {
		opacity: 0.5;
		cursor: default;
	}
</style>

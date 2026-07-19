<script lang="ts">
	import { verdictStore } from '$lib/verdicts/verdicts.svelte';
	import Icon from '../icons/Icon.svelte';

	let { recipeId, size = 'normal' }: { recipeId: number; size?: 'normal' | 'compact' } = $props();

	const verdict = $derived(verdictStore.verdictFor(recipeId));
	const busy = $derived(verdictStore.isPending(recipeId));
</script>

<!-- State is carried by icon shape (filled vs outline star, crossed circle),
     the label and aria-pressed — never by colour alone. -->
<div class="verdicts" class:compact={size === 'compact'}>
	<button
		type="button"
		class="verdict"
		class:on={verdict === 'liked'}
		aria-pressed={verdict === 'liked'}
		disabled={busy}
		onclick={() => verdictStore.toggle(recipeId, 'liked')}
	>
		<Icon name={verdict === 'liked' ? 'star' : 'star-outline'} size={16} />
		<span>Favorit</span>
	</button>
	<button
		type="button"
		class="verdict"
		class:on={verdict === 'vetoed'}
		aria-pressed={verdict === 'vetoed'}
		disabled={busy}
		onclick={() => verdictStore.toggle(recipeId, 'vetoed')}
	>
		<Icon name="ban" size={16} />
		<span>Aldrig igen</span>
	</button>
</div>

<style>
	.verdicts {
		display: flex;
		gap: var(--space-2);
		flex-wrap: wrap;
	}

	.verdict {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		padding: var(--space-1) var(--space-2);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		background: var(--surface);
		color: var(--muted);
		font: inherit;
		font-size: var(--text-sm);
		cursor: pointer;
	}

	.verdict:hover:not(:disabled) {
		border-color: var(--muted);
	}

	.verdict:disabled {
		opacity: 0.6;
		cursor: default;
	}

	/* A pressed button reads as pressed from its heavier border and weight, so
	   the state survives any colour-vision deficiency. */
	.verdict.on {
		border-color: currentcolor;
		border-width: 2px;
		padding: calc(var(--space-1) - 1px) calc(var(--space-2) - 1px);
		background: var(--surface-2);
		color: var(--text);
		font-weight: 700;
	}

	.compact .verdict {
		padding: 2px var(--space-1);
		font-size: 0.75rem;
	}

	.compact .verdict.on {
		padding: 1px calc(var(--space-1) - 1px);
	}
</style>

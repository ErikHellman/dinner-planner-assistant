<script lang="ts">
	import type { ShoppingListItem } from '$lib/server/recipes/aggregate';

	let {
		title,
		items,
		ordinals,
		note
	}: {
		title: string;
		items: ShoppingListItem[];
		/** recipeId → 1-based ordinal in the plan (shown when the plan has >1 recipe). */
		ordinals: Record<number, number>;
		note?: string;
	} = $props();

	const showOrigins = $derived(new Set(Object.values(ordinals)).size > 1);

	function amountText(item: ShoppingListItem): string {
		const amounts = item.amounts.map((a) => a.display).join(' + ');
		if (item.toTaste) return amounts ? `${amounts} + efter smak` : 'efter smak';
		return amounts;
	}
</script>

<section>
	<h2>{title} <span class="count">({items.length})</span></h2>
	{#if note}
		<p class="note">{note}</p>
	{/if}
	<ul>
		{#each items as item (item.name)}
			<li>
				<span class="name">{item.name}</span>
				<span class="amount">{amountText(item)}</span>
				{#if showOrigins}
					<span class="origins">
						{#each [...new Set(item.recipeIds
									.map((id) => ordinals[id])
									.filter(Boolean))] as ordinal (ordinal)}
							<span class="origin" aria-label="Ingår i recept {ordinal}">{ordinal}</span>
						{/each}
					</span>
				{/if}
			</li>
		{/each}
	</ul>
</section>

<style>
	section {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: var(--space-4);
	}

	h2 {
		margin: 0 0 var(--space-2);
		font-size: var(--text-lg);
	}

	.count {
		color: var(--muted);
		font-weight: 400;
		font-size: var(--text-sm);
	}

	.note {
		margin: 0 0 var(--space-2);
		color: var(--muted);
		font-size: 0.75rem;
	}

	ul {
		list-style: none;
		margin: 0;
		padding: 0;
	}

	li {
		display: flex;
		align-items: baseline;
		gap: var(--space-2);
		padding: var(--space-2) 0;
		border-bottom: 1px solid var(--border);
		font-size: var(--text-sm);
	}

	li:last-child {
		border-bottom: none;
	}

	.name {
		font-weight: 600;
	}

	.amount {
		color: var(--muted);
		margin-left: auto;
		text-align: right;
	}

	.origins {
		display: inline-flex;
		gap: 2px;
		flex-shrink: 0;
	}

	.origin {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 1.2rem;
		height: 1.2rem;
		border-radius: 50%;
		background: var(--surface-2);
		border: 1px solid var(--border);
		font-size: 0.65rem;
		font-weight: 700;
	}
</style>

<script lang="ts">
	import { isWeightProduct } from '$lib/cart/weight';
	import type { CoverageDiff } from '$lib/plans/coverage';
	import type { WillysCartSnapshot } from '$lib/plans/types';
	import Icon from '../icons/Icon.svelte';

	let { snapshot, diff }: { snapshot: WillysCartSnapshot; diff: CoverageDiff } = $props();

	const extraIds = $derived(new Set(diff.extra.map((line) => line.productId)));

	const recordedAt = new Intl.DateTimeFormat('sv-SE', {
		dateStyle: 'medium',
		timeStyle: 'short'
	});

	function quantityText(line: WillysCartSnapshot['lines'][number]): string {
		if (isWeightProduct(line.productId)) return `${line.quantity} g`;
		return line.pickUnit === 'kilogram' ? `${line.quantity} kg` : `${line.quantity} st`;
	}
</script>

<section>
	<h2>Willys-produkter <span class="count">({snapshot.lines.length})</span></h2>
	<p class="note">Registrerad {recordedAt.format(new Date(snapshot.recordedAt))}</p>

	{#if !diff.hasCoverage}
		<p class="coverage unknown">
			<Icon name="info" size={16} />
			<span
				>Det går inte att se vilka varor som täcker vilka ingredienser — planen sparades innan
				assistenten började registrera det.</span
			>
		</p>
	{:else if diff.unmatched.length > 0}
		<div class="coverage missing">
			<p class="coverage-head">
				<Icon name="warning" size={16} />
				<span
					><strong>{diff.unmatched.length}</strong> av {diff.matched.length + diff.unmatched.length}
					ingredienser saknar vara i varukorgen</span
				>
			</p>
			<ul class="missing-list">
				{#each diff.unmatched as name (name)}
					<li>{name}</li>
				{/each}
			</ul>
		</div>
	{:else}
		<p class="coverage complete">
			<Icon name="check" size={16} />
			<span>Alla {diff.matched.length} ingredienser täcks av varor i varukorgen.</span>
		</p>
	{/if}

	<ul>
		{#each snapshot.lines as line (line.productId + line.pickUnit)}
			<li>
				{#if line.imageUrl}
					<img src={line.imageUrl} alt="" loading="lazy" width="36" height="36" />
				{:else}
					<span class="noimg" aria-hidden="true"><Icon name="cart" size={16} /></span>
				{/if}
				<span class="name">{line.name}</span>
				{#if diff.hasCoverage && extraIds.has(line.productId)}
					<span class="badge">utöver listan</span>
				{/if}
				<span class="qty">{quantityText(line)}</span>
				<span class="total">{line.lineTotal.formatted}</span>
			</li>
		{/each}
	</ul>
	<p class="subtotal">
		<span>Delsumma</span>
		<span>{snapshot.subtotal.formatted}</span>
	</p>
</section>

<style>
	section {
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: var(--space-4);
	}

	h2 {
		margin: 0 0 var(--space-1);
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

	/* State is carried by icon and wording, never by colour alone. */
	.coverage {
		display: flex;
		align-items: flex-start;
		gap: var(--space-2);
		margin: 0 0 var(--space-3);
		padding: var(--space-2);
		border-radius: var(--radius-sm);
		font-size: var(--text-sm);
	}

	.coverage :global(svg) {
		flex-shrink: 0;
		margin-top: 0.1em;
	}

	.coverage.complete {
		background: var(--success-bg);
		color: var(--success);
	}

	.coverage.unknown {
		background: var(--surface-2);
		color: var(--muted);
	}

	.coverage.missing {
		display: block;
		background: var(--warning-bg);
		color: var(--warning-text);
	}

	.coverage-head {
		display: flex;
		align-items: flex-start;
		gap: var(--space-2);
		margin: 0;
	}

	.missing-list {
		margin: var(--space-1) 0 0 calc(16px + var(--space-2));
		padding: 0;
		list-style: disc inside;
	}

	.badge {
		flex-shrink: 0;
		padding: 0 var(--space-1);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		color: var(--muted);
		font-size: 0.7rem;
		white-space: nowrap;
	}

	ul {
		list-style: none;
		margin: 0;
		padding: 0;
	}

	li {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		padding: var(--space-1) 0;
		border-bottom: 1px solid var(--border);
		font-size: var(--text-sm);
	}

	li:last-child {
		border-bottom: none;
	}

	img,
	.noimg {
		width: 36px;
		height: 36px;
		border-radius: var(--radius-sm);
		object-fit: contain;
		background: #ffffff;
		flex-shrink: 0;
	}

	.noimg {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		color: var(--muted);
		background: var(--surface-2);
	}

	.name {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.qty {
		margin-left: auto;
		color: var(--muted);
		flex-shrink: 0;
	}

	.total {
		min-width: 5rem;
		text-align: right;
		font-variant-numeric: tabular-nums;
		flex-shrink: 0;
	}

	.subtotal {
		display: flex;
		justify-content: space-between;
		margin: var(--space-3) 0 0;
		font-weight: 700;
	}
</style>

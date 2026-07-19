<script lang="ts">
	import { isWeightProduct } from '$lib/cart/weight';
	import type { WillysCartSnapshot } from '$lib/plans/types';
	import Icon from '../icons/Icon.svelte';

	let { snapshot }: { snapshot: WillysCartSnapshot } = $props();

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
	<ul>
		{#each snapshot.lines as line (line.productId + line.pickUnit)}
			<li>
				{#if line.imageUrl}
					<img src={line.imageUrl} alt="" loading="lazy" width="36" height="36" />
				{:else}
					<span class="noimg" aria-hidden="true"><Icon name="cart" size={16} /></span>
				{/if}
				<span class="name">{line.name}</span>
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

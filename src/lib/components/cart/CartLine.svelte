<script lang="ts">
	import { isWeightProduct, piecesFromGrams } from '$lib/cart/weight';
	import type { NormalizedCartLine } from '$lib/server/willys/types';
	import Icon from '../icons/Icon.svelte';
	import Stepper from '../ui/Stepper.svelte';

	let {
		line,
		disabled,
		onquantity,
		onremove
	}: {
		line: NormalizedCartLine;
		disabled: boolean;
		onquantity: (next: number) => void;
		onremove: () => void;
	} = $props();

	// Weight products (_KG) report grams in the cart but are SET in pieces
	// (see $lib/cart/weight.ts) — the stepper works in pieces for every line.
	const isWeight = $derived(isWeightProduct(line.productId));
	const pieces = $derived(
		isWeight ? piecesFromGrams(line.quantity, line.displaySize) : line.quantity
	);
	const step = $derived(!isWeight && line.pickUnit === 'kilogram' ? 0.5 : 1);
	const unitLabel = $derived(!isWeight && line.pickUnit === 'kilogram' ? 'kg' : 'st');
	const meta = $derived([line.brand, line.displaySize].filter(Boolean).join(' · '));
</script>

<article>
	{#if line.imageUrl}
		<img src={line.imageUrl} alt="" loading="lazy" width="56" height="56" />
	{:else}
		<span class="noimg" aria-hidden="true"><Icon name="cart" size={22} /></span>
	{/if}

	<div class="info">
		<p class="name">{line.name}</p>
		{#if meta}
			<p class="meta">{meta}</p>
		{/if}
		{#if line.unitPrice.formatted}
			<!-- Willys' own string already carries the unit where relevant ("14,90 kr/kg"). -->
			<p class="meta">
				{line.unitPrice.formatted}{#if isWeight}
					· ca {line.quantity} g i korgen{/if}
			</p>
		{/if}
	</div>

	<div class="controls">
		<Stepper value={pieces} {step} {unitLabel} name={line.name} {disabled} onchange={onquantity} />
		<p class="total">{line.lineTotal.formatted}</p>
		<button type="button" class="remove" onclick={onremove} {disabled}>
			<Icon name="trash" size={16} />
			Ta bort
		</button>
	</div>
</article>

<style>
	article {
		display: grid;
		grid-template-columns: auto 1fr;
		grid-template-areas:
			'img info'
			'img controls';
		gap: var(--space-2) var(--space-3);
		padding: var(--space-3) 0;
		border-bottom: 1px solid var(--border);
	}

	img,
	.noimg {
		grid-area: img;
		width: 56px;
		height: 56px;
		border-radius: var(--radius-sm);
		object-fit: contain;
		background: #ffffff; /* product shots assume a white backdrop, also in dark mode */
	}

	.noimg {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		color: var(--muted);
		background: var(--surface-2);
	}

	.info {
		grid-area: info;
		min-width: 0;
	}

	.name {
		margin: 0;
		font-weight: 600;
	}

	.meta {
		margin: 2px 0 0;
		font-size: var(--text-sm);
		color: var(--muted);
	}

	.controls {
		grid-area: controls;
		display: flex;
		align-items: center;
		gap: var(--space-3);
		flex-wrap: wrap;
	}

	.total {
		margin: 0;
		font-weight: 700;
		font-variant-numeric: tabular-nums;
		margin-left: auto;
	}

	.remove {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		font: inherit;
		font-size: var(--text-sm);
		color: var(--text);
		background: none;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		padding: 0.4rem 0.7rem;
		cursor: pointer;
	}

	.remove:hover:not(:disabled) {
		background: var(--surface-2);
	}

	.remove:disabled {
		opacity: 0.4;
		cursor: default;
	}

	@media (min-width: 640px) {
		article {
			grid-template-columns: auto 1fr auto;
			grid-template-areas: 'img info controls';
			align-items: center;
		}

		.controls {
			flex-wrap: nowrap;
		}

		.total {
			min-width: 5.5rem;
			text-align: right;
			margin-left: 0;
		}
	}
</style>

<script lang="ts">
	import { cartStore } from '$lib/cart/cart.svelte';
	import Icon from '../icons/Icon.svelte';
	import Banner from '../ui/Banner.svelte';
	import EmptyState from '../ui/EmptyState.svelte';
	import Spinner from '../ui/Spinner.svelte';
	import CartLine from './CartLine.svelte';

	const WILLYS_CART_URL = 'https://www.willys.se/varukorg';

	let confirmClear = $state(false);

	const cart = $derived(cartStore.cart);
	const hasDeposit = $derived((cart?.deposit.amount ?? 0) > 0);
	const hasDiscount = $derived((cart?.discountTotal.amount ?? 0) > 0);

	async function clear() {
		confirmClear = false;
		await cartStore.clear();
	}
</script>

<div class="page">
	<header>
		<h1>Varukorg</h1>
		<button type="button" class="reload" onclick={() => cartStore.load()} disabled={cartStore.busy}>
			<Icon name="refresh" size={16} />
			Uppdatera
		</button>
	</header>

	<div class="content">
		<div class="column">
			{#if cartStore.notConfigured}
				<Banner variant="error">{cartStore.error}</Banner>
			{:else}
				{#if cartStore.error}
					<Banner variant="error">{cartStore.error}</Banner>
				{/if}

				{#if !cart}
					{#if cartStore.status === 'loading'}
						<div class="center"><Spinner label="Hämtar varukorgen…" /></div>
					{/if}
				{:else if cart.lines.length === 0}
					<EmptyState icon="cart" title="Varukorgen är tom">
						<p>Be assistenten fylla den under fliken Planera.</p>
					</EmptyState>
				{:else}
					<p class="summary" aria-live="polite">
						{cart.itemCount}
						{cart.itemCount === 1 ? 'vara' : 'varor'}
					</p>

					<div class="lines">
						{#each cart.lines as line (line.productId + line.pickUnit)}
							<CartLine
								{line}
								disabled={cartStore.busy}
								onquantity={(next) => cartStore.setQuantity(line, next)}
								onremove={() => cartStore.setQuantity(line, 0)}
							/>
						{/each}
					</div>

					<dl class="totals">
						{#if hasDeposit}
							<div>
								<dt>Pant</dt>
								<dd>{cart.deposit.formatted}</dd>
							</div>
						{/if}
						{#if hasDiscount}
							<div>
								<dt>Rabatt</dt>
								<dd>−{cart.discountTotal.formatted}</dd>
							</div>
						{/if}
						<div class="grand">
							<dt>Delsumma</dt>
							<dd>{cart.subtotal.formatted}</dd>
						</div>
					</dl>

					<div class="actions">
						{#if confirmClear}
							<span class="confirm" role="alert">Är du säker?</span>
							<button type="button" class="danger" onclick={clear} disabled={cartStore.busy}>
								Ja, töm
							</button>
							<button type="button" class="ghost" onclick={() => (confirmClear = false)}>
								Avbryt
							</button>
						{:else}
							<button
								type="button"
								class="ghost"
								onclick={() => (confirmClear = true)}
								disabled={cartStore.busy}
							>
								<Icon name="trash" size={16} />
								Töm varukorgen
							</button>
						{/if}

						<a class="checkout" href={WILLYS_CART_URL} target="_blank" rel="noopener noreferrer">
							Slutför köpet på willys.se
							<Icon name="external" size={16} />
						</a>
					</div>
				{/if}
			{/if}
		</div>
	</div>
</div>

<style>
	.page {
		flex: 1;
		min-height: 0;
		display: flex;
		flex-direction: column;
	}

	header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-4);
		padding: var(--space-3) var(--space-4);
		border-bottom: 1px solid var(--border);
		background: var(--surface);
	}

	h1 {
		font-size: var(--text-lg);
		margin: 0;
	}

	.reload {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		font: inherit;
		font-size: 0.9rem;
		background: none;
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 0.35rem 0.8rem;
		color: var(--text);
		cursor: pointer;
	}

	.reload:disabled {
		opacity: 0.5;
		cursor: default;
	}

	.content {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
	}

	.column {
		max-width: 44rem;
		margin: 0 auto;
		padding: var(--space-4);
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}

	.center {
		display: flex;
		justify-content: center;
		padding: var(--space-7) 0;
	}

	.summary {
		margin: 0;
		color: var(--muted);
		font-size: var(--text-sm);
	}

	.lines {
		display: flex;
		flex-direction: column;
	}

	.totals {
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
	}

	.totals div {
		display: flex;
		justify-content: space-between;
	}

	.totals dt {
		color: var(--muted);
	}

	.totals dd {
		margin: 0;
		font-variant-numeric: tabular-nums;
	}

	.grand dt,
	.grand dd {
		font-weight: 700;
		color: var(--text);
		font-size: var(--text-lg);
	}

	.actions {
		display: flex;
		align-items: center;
		gap: var(--space-3);
		flex-wrap: wrap;
		padding-bottom: var(--space-4);
	}

	.confirm {
		font-weight: 600;
	}

	button,
	.checkout {
		display: inline-flex;
		align-items: center;
		gap: var(--space-2);
		font: inherit;
		border-radius: var(--radius);
		padding: 0.6rem 1rem;
		cursor: pointer;
		text-decoration: none;
	}

	.ghost {
		background: none;
		border: 1px solid var(--border);
		color: var(--text);
	}

	.ghost:hover:not(:disabled) {
		background: var(--surface-2);
	}

	.danger {
		background: var(--error);
		border: none;
		color: var(--bg);
		font-weight: 600;
	}

	.ghost:disabled,
	.danger:disabled {
		opacity: 0.5;
		cursor: default;
	}

	.checkout {
		margin-left: auto;
		background: var(--accent);
		color: var(--accent-contrast);
		font-weight: 600;
		border: none;
	}

	@media (max-width: 480px) {
		.checkout {
			margin-left: 0;
			width: 100%;
			justify-content: center;
		}
	}
</style>

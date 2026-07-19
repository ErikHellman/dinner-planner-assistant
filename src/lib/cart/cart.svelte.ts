import { ApiError, apiFetch, messageFor } from '$lib/api/client';
import type { NormalizedCart, NormalizedCartLine } from '$lib/server/willys/types';

export type CartStatus = 'idle' | 'loading' | 'mutating';

/** Client cache of the live Willys cart. Every operation returns the full
 * updated cart from the server, which replaces the local state wholesale. */
export class CartStore {
	cart = $state.raw<NormalizedCart | null>(null);
	status = $state<CartStatus>('idle');
	error = $state<string | null>(null);
	notConfigured = $state(false);

	get busy(): boolean {
		return this.status !== 'idle';
	}

	async load(): Promise<void> {
		if (this.busy) return;
		this.status = 'loading';
		await this.#request(() => apiFetch<NormalizedCart>('/api/cart'));
	}

	/** Set the absolute quantity of a line; 0 removes it. */
	async setQuantity(line: NormalizedCartLine, quantity: number): Promise<void> {
		if (this.busy || quantity < 0) return;
		this.status = 'mutating';
		await this.#request(() =>
			apiFetch<NormalizedCart>('/api/cart/items', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ productId: line.productId, quantity, pickUnit: line.pickUnit })
			})
		);
	}

	async clear(): Promise<void> {
		if (this.busy) return;
		this.status = 'mutating';
		await this.#request(() => apiFetch<NormalizedCart>('/api/cart', { method: 'DELETE' }));
	}

	async #request(run: () => Promise<NormalizedCart>): Promise<void> {
		this.error = null;
		try {
			this.cart = await run();
			this.notConfigured = false;
		} catch (err) {
			this.error = messageFor(err);
			this.notConfigured = err instanceof ApiError && err.code === 'willys_not_configured';
		} finally {
			this.status = 'idle';
		}
	}
}

/** Module singleton: cart state survives tab navigation (single-user app). */
export const cartStore = new CartStore();

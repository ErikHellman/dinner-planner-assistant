import { WillysSession } from './session';
import { normalizeCart, normalizeProduct, type RawCart } from './normalize';
import type { NormalizedCart, NormalizedProduct, RawBreadcrumb, RawProduct } from './types';

const MAX_SIZE = 30;
const ENRICH_CONCURRENCY = 4;

/** High-level, login-gated Willys operations returning normalized output. */
export class WillysClient {
	private categoryCache = new Map<string, string[]>();

	constructor(private readonly session: WillysSession) {}

	private extractCategories(breadcrumbs?: RawBreadcrumb[]): string[] {
		return (breadcrumbs ?? [])
			.filter((b) => b.categoryCode && b.categoryCode !== 'N00')
			.map((b) => b.name);
	}

	private async categoriesFor(code: string): Promise<string[]> {
		const cached = this.categoryCache.get(code);
		if (cached) return cached;
		try {
			const res = await this.session.read(`/axfood/rest/v1/p/${encodeURIComponent(code)}`);
			if (!res.ok) return []; // don't cache transient failures
			const body = (await res.json()) as { breadcrumbs?: RawBreadcrumb[] };
			const categories = this.extractCategories(body.breadcrumbs);
			this.categoryCache.set(code, categories); // cache only on success
			return categories;
		} catch (err) {
			console.warn(
				`Willys category enrichment failed for ${code}: ${err instanceof Error ? err.message : String(err)}`
			);
			return []; // best-effort: never fail the whole search on one product
		}
	}

	/** Search products, enriching each hit with its category breadcrumb. */
	async search(query: string, page = 0, size = MAX_SIZE): Promise<NormalizedProduct[]> {
		const capped = Math.min(Math.max(1, size), MAX_SIZE);
		const res = await this.session.read(
			`/axfood/rest/v1/search?q=${encodeURIComponent(query)}&page=${page}&size=${capped}`
		);
		if (!res.ok) throw new Error(`Willys search failed for "${query}" (${res.status})`);
		const body = (await res.json()) as { results?: RawProduct[] };
		const raw = body.results ?? [];
		return this.enrich(raw);
	}

	private async enrich(raw: RawProduct[]): Promise<NormalizedProduct[]> {
		const out: NormalizedProduct[] = new Array(raw.length);
		let next = 0;
		const worker = async () => {
			while (next < raw.length) {
				const i = next++;
				out[i] = normalizeProduct(raw[i], await this.categoriesFor(raw[i].code));
			}
		};
		await Promise.all(Array.from({ length: Math.min(ENRICH_CONCURRENCY, raw.length) }, worker));
		return out;
	}

	/** Single product detail (normalized, category-enriched). */
	async product(productId: string): Promise<NormalizedProduct> {
		const res = await this.session.read(`/axfood/rest/v1/p/${encodeURIComponent(productId)}`);
		if (!res.ok) throw new Error(`Willys product lookup failed for ${productId} (${res.status})`);
		const raw = (await res.json()) as RawProduct & { breadcrumbs?: RawBreadcrumb[] };
		const categories = this.extractCategories(raw.breadcrumbs);
		this.categoryCache.set(productId, categories);
		return normalizeProduct(raw, categories);
	}

	async getCart(): Promise<NormalizedCart> {
		const res = await this.session.read('/axfood/rest/v1/cart');
		if (!res.ok) throw new Error(`Willys cart read failed (${res.status})`);
		const raw = (await res.json()) as RawCart;
		const storeId = await this.activeStoreId();
		return normalizeCart(raw, storeId);
	}

	private async activeStoreId(): Promise<string | null> {
		const res = await this.session.read('/axfood/rest/v1/store/active');
		if (!res.ok) return null;
		const body = (await res.json()) as { id?: string };
		return body.id ?? null;
	}

	/** Add or set the absolute quantity of a product. pickUnit defaults to "pieces". */
	async setQuantity(
		productId: string,
		quantity: number,
		pickUnit: 'pieces' | 'kilogram' = 'pieces'
	): Promise<NormalizedCart> {
		const qs = `productCodePost=${encodeURIComponent(productId)}&qty=${quantity}&pickUnit=${pickUnit}`;
		const res = await this.session.mutate(`/axfood/rest/v1/cart/addProduct?${qs}`, {
			method: 'POST'
		});
		if (!res.ok) {
			const text = await res.text();
			throw new Error(`Willys cart update failed (${res.status}): ${text.slice(0, 200)}`);
		}
		return this.getCart();
	}

	async addToCart(
		productId: string,
		quantity = 1,
		pickUnit: 'pieces' | 'kilogram' = 'pieces'
	): Promise<NormalizedCart> {
		return this.setQuantity(productId, quantity, pickUnit);
	}

	async removeFromCart(
		productId: string,
		pickUnit: 'pieces' | 'kilogram' = 'pieces'
	): Promise<NormalizedCart> {
		return this.setQuantity(productId, 0, pickUnit);
	}

	async clearCart(): Promise<NormalizedCart> {
		const res = await this.session.mutate('/axfood/rest/v1/cart', { method: 'DELETE' });
		if (!res.ok) throw new Error(`Willys cart clear failed (${res.status})`);
		return this.getCart();
	}
}

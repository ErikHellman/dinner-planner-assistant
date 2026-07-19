import { WillysSession } from './session';
import { normalizeCart, normalizeProduct, type RawCart } from './normalize';
import type { NormalizedCart, NormalizedProduct, RawBreadcrumb, RawProduct } from './types';

const MAX_SIZE = 30;
const ENRICH_CONCURRENCY = 4;

/** willys.se answers request floods with rate-limit pages that carry HTTP 200
 * but an HTML body — never feed those to res.json(). */
function isJsonResponse(res: Response): boolean {
	return (res.headers.get('content-type') ?? '').toLowerCase().includes('json');
}

/** Runs tasks with at most `slots` in flight; the rest queue in FIFO order. */
class Semaphore {
	private waiters: (() => void)[] = [];

	constructor(private slots: number) {}

	async run<T>(task: () => Promise<T>): Promise<T> {
		if (this.slots > 0) this.slots -= 1;
		else await new Promise<void>((resolve) => this.waiters.push(resolve));
		try {
			return await task();
		} finally {
			const next = this.waiters.shift();
			if (next) next();
			else this.slots += 1;
		}
	}
}

/** High-level, login-gated Willys operations returning normalized output. */
export class WillysClient {
	private categoryCache = new Map<string, string[]>();
	// CLIENT-WIDE enrichment gate. The Pi agent parallelizes willys_search
	// calls (39 at once has happened); a per-search worker pool multiplied
	// that into 150+ concurrent /p/ fetches and willys.se started serving
	// 200-status HTML rate-limit pages. One shared gate keeps the total
	// enrichment pressure constant no matter how many searches run at once.
	private enrichGate = new Semaphore(ENRICH_CONCURRENCY);

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
			return await this.enrichGate.run(async () => {
				// A queued duplicate may have been resolved while we waited.
				const cachedWhileQueued = this.categoryCache.get(code);
				if (cachedWhileQueued) return cachedWhileQueued;
				const res = await this.session.read(`/axfood/rest/v1/p/${encodeURIComponent(code)}`);
				if (!res.ok) return []; // don't cache transient failures
				if (!isJsonResponse(res)) {
					console.warn(
						`Willys served a non-JSON ${res.status} response for ${code} (likely rate limiting) — categories skipped`
					);
					return []; // don't cache: the next lookup usually succeeds
				}
				const body = (await res.json()) as { breadcrumbs?: RawBreadcrumb[] };
				const categories = this.extractCategories(body.breadcrumbs);
				this.categoryCache.set(code, categories); // cache only on success
				return categories;
			});
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
		// Fan out freely — the shared enrichGate inside categoriesFor throttles.
		return Promise.all(
			raw.map(async (product) => normalizeProduct(product, await this.categoriesFor(product.code)))
		);
	}

	/** Single product detail (normalized, category-enriched). */
	async product(productId: string): Promise<NormalizedProduct> {
		const res = await this.session.read(`/axfood/rest/v1/p/${encodeURIComponent(productId)}`);
		if (!res.ok) throw new Error(`Willys product lookup failed for ${productId} (${res.status})`);
		if (!isJsonResponse(res)) {
			throw new Error(
				`Willys product lookup for ${productId} returned a non-JSON ${res.status} response (likely rate limiting) — try again shortly`
			);
		}
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

import { describe, expect, it, beforeAll, afterAll, vi } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import { WillysSession } from './session';
import { WillysClient } from './client';

const LIVE =
	process.env.WILLYS_LIVE === '1' && !!process.env.WILLYS_USERNAME && !!process.env.WILLYS_PASSWORD;
const d = LIVE ? describe : describe.skip;
const MILK = '101233933_ST';

/**
 * Build a fake WillysSession that answers read()/mutate() from a routing
 * function and records the requested URLs. WillysClient only calls
 * session.read(path) and session.mutate(path, init).
 */
function fakeSession(routes: (url: string) => { status: number; body?: unknown; html?: string }): {
	session: WillysSession;
	readUrls: string[];
	mutateUrls: string[];
} {
	const readUrls: string[] = [];
	const mutateUrls: string[] = [];
	const respond = (url: string) => {
		const route = routes(url);
		if (route.html !== undefined) {
			return new Response(route.html, {
				status: route.status,
				headers: { 'content-type': 'text/html;charset=UTF-8' }
			});
		}
		return new Response(JSON.stringify(route.body), {
			status: route.status,
			headers: { 'content-type': 'application/json' }
		});
	};
	const session = {
		read: async (p: string) => {
			readUrls.push(p);
			return respond(p);
		},
		mutate: async (p: string) => {
			mutateUrls.push(p);
			return respond(p);
		}
	} as unknown as WillysSession;
	return { session, readUrls, mutateUrls };
}

const productBody = (code: string, categoryCodes: [string, string][]) => ({
	code,
	name: `Product ${code}`,
	breadcrumbs: categoryCodes.map(([categoryCode, name]) => ({ categoryCode, name }))
});

describe('WillysClient (mocked)', () => {
	it('caps search size at 30 even when a larger size is requested', async () => {
		const { session, readUrls } = fakeSession((url) => {
			if (url.startsWith('/axfood/rest/v1/search')) {
				return { status: 200, body: { results: [{ code: 'A_ST', name: 'A' }] } };
			}
			return { status: 200, body: { breadcrumbs: [] } };
		});
		const client = new WillysClient(session);
		await client.search('mjölk', 0, 100);
		const searchUrl = readUrls.find((u) => u.startsWith('/axfood/rest/v1/search'));
		expect(searchUrl).toContain('size=30');
		expect(searchUrl).not.toContain('size=100');
	});

	it('is best-effort on enrichment failure: product still appears with empty categories, search does not reject', async () => {
		const { session } = fakeSession((url) => {
			if (url.startsWith('/axfood/rest/v1/search')) {
				return { status: 200, body: { results: [{ code: 'A_ST', name: 'A' }] } };
			}
			if (url.startsWith('/axfood/rest/v1/p/')) {
				return { status: 500, body: { error: 'boom' } };
			}
			return { status: 200, body: {} };
		});
		const client = new WillysClient(session);
		const results = await client.search('mjölk', 0, 5);
		expect(results).toHaveLength(1);
		expect(results[0].productId).toBe('A_ST');
		expect(results[0].categories).toEqual([]);
	});

	it('does not cache a failed enrichment: a later success yields the real categories', async () => {
		let pCalls = 0;
		const { session } = fakeSession((url) => {
			if (url.startsWith('/axfood/rest/v1/search')) {
				return { status: 200, body: { results: [{ code: 'A_ST', name: 'A' }] } };
			}
			if (url.startsWith('/axfood/rest/v1/p/')) {
				pCalls += 1;
				// First lookup fails, second succeeds with breadcrumbs.
				return pCalls === 1
					? { status: 500, body: { error: 'boom' } }
					: {
							status: 200,
							body: productBody('A_ST', [
								['DP01', 'Mejeri'],
								['DP02', 'Mjölk']
							])
						};
			}
			return { status: 200, body: {} };
		});
		const client = new WillysClient(session);

		const first = await client.search('mjölk', 0, 5);
		expect(first[0].categories).toEqual([]); // enrichment failed, not cached

		const detail = await client.product('A_ST');
		expect(detail.categories).toEqual(['Mejeri', 'Mjölk']); // now resolves
	});

	it('bounds enrichment concurrency globally across concurrent searches', async () => {
		// The Pi agent parallelizes willys_search tool calls (39 at once in the
		// wild); per-search worker pools multiplied into 150+ concurrent /p/
		// fetches, which willys.se answered with 200-status HTML rate-limit
		// pages. The cap must hold client-wide, not per search() call.
		let inflight = 0;
		let maxInflight = 0;
		const session = {
			read: async (p: string) => {
				if (p.startsWith('/axfood/rest/v1/search')) {
					const query = new URLSearchParams(p.split('?')[1]).get('q') ?? 'x';
					const results = Array.from({ length: 8 }, (_, i) => ({
						code: `${query}${i}_ST`,
						name: query
					}));
					return new Response(JSON.stringify({ results }), {
						status: 200,
						headers: { 'content-type': 'application/json' }
					});
				}
				inflight += 1;
				maxInflight = Math.max(maxInflight, inflight);
				await new Promise((resolve) => setTimeout(resolve, 5));
				inflight -= 1;
				return new Response(JSON.stringify({ breadcrumbs: [] }), {
					status: 200,
					headers: { 'content-type': 'application/json' }
				});
			}
		} as unknown as WillysSession;

		const client = new WillysClient(session);
		await Promise.all([client.search('a'), client.search('b'), client.search('c')]);

		expect(maxInflight).toBeLessThanOrEqual(4);
		expect(maxInflight).toBeGreaterThan(0);
	});

	it('treats a 200 HTML response during enrichment as rate limiting: empty categories, clear warning, no cache', async () => {
		let pCalls = 0;
		const { session } = fakeSession((url) => {
			if (url.startsWith('/axfood/rest/v1/search')) {
				return { status: 200, body: { results: [{ code: 'A_ST', name: 'A' }] } };
			}
			if (url.startsWith('/axfood/rest/v1/p/')) {
				pCalls += 1;
				// Rate-limited first (HTML page with HTTP 200), fine afterwards.
				return pCalls === 1
					? { status: 200, html: '<!DOCTYPE html><html><body>Vänta lite…</body></html>' }
					: { status: 200, body: productBody('A_ST', [['DP02', 'Mjölk']]) };
			}
			return { status: 200, body: {} };
		});
		const warnings: string[] = [];
		const warnSpy = vi.spyOn(console, 'warn').mockImplementation((msg: unknown) => {
			warnings.push(String(msg));
		});
		try {
			const client = new WillysClient(session);

			const results = await client.search('mjölk', 0, 5);
			expect(results[0].categories).toEqual([]);
			expect(warnings.join('\n')).toContain('non-JSON');
			expect(warnings.join('\n')).not.toContain('Unexpected token');

			// Not cached: the next lookup gets the real categories.
			const detail = await client.product('A_ST');
			expect(detail.categories).toEqual(['Mjölk']);
		} finally {
			warnSpy.mockRestore();
		}
	});

	it('product() reports a descriptive error on a 200 HTML response instead of a JSON parse error', async () => {
		const { session } = fakeSession((url) => {
			if (url.startsWith('/axfood/rest/v1/p/')) {
				return { status: 200, html: '<!DOCTYPE html><html><body>Vänta lite…</body></html>' };
			}
			return { status: 200, body: {} };
		});
		const client = new WillysClient(session);
		await expect(client.product('A_ST')).rejects.toThrow(/non-JSON/);
	});

	it('drops the N00 breadcrumb when extracting categories', async () => {
		const { session } = fakeSession(() => ({
			status: 200,
			body: productBody('A_ST', [
				['N00', 'Root'],
				['DP02', 'Mjölk']
			])
		}));
		const client = new WillysClient(session);
		const detail = await client.product('A_ST');
		expect(detail.categories).toEqual(['Mjölk']);
	});

	it('setQuantity builds productCodePost/qty/pickUnit and reads the cart afterward', async () => {
		const { session, mutateUrls, readUrls } = fakeSession((url) => {
			if (url.startsWith('/axfood/rest/v1/cart/addProduct')) {
				return { status: 200, body: { ok: true } };
			}
			if (url === '/axfood/rest/v1/cart') {
				return { status: 200, body: { totalItems: 0, products: [] } };
			}
			return { status: 200, body: {} };
		});
		const client = new WillysClient(session);
		await client.setQuantity('A_ST', 3, 'kilogram');
		const mutateUrl = mutateUrls[0];
		expect(mutateUrl).toContain('productCodePost=A_ST');
		expect(mutateUrl).toContain('qty=3');
		expect(mutateUrl).toContain('pickUnit=kilogram');
		// Follow-up cart read happened.
		expect(readUrls).toContain('/axfood/rest/v1/cart');
	});

	it('removeFromCart sets qty=0', async () => {
		const { session, mutateUrls } = fakeSession((url) => {
			if (url.startsWith('/axfood/rest/v1/cart/addProduct')) {
				return { status: 200, body: { ok: true } };
			}
			return { status: 200, body: { totalItems: 0, products: [] } };
		});
		const client = new WillysClient(session);
		await client.removeFromCart('A_ST');
		expect(mutateUrls[0]).toContain('qty=0');
		expect(mutateUrls[0]).toContain('productCodePost=A_ST');
		expect(mutateUrls[0]).toContain('pickUnit=pieces');
	});
});

d('WillysClient (live)', () => {
	let client: WillysClient;
	beforeAll(() => {
		const file = path.join(os.tmpdir(), `willys-client-session-${process.pid}.json`);
		client = new WillysClient(new WillysSession(process.env, file));
	});
	afterAll(async () => {
		await client.clearCart();
	});

	it('search returns category-enriched products', async () => {
		const results = await client.search('mjölk', 0, 5);
		expect(results.length).toBeGreaterThan(0);
		expect(results[0].productId).toMatch(/_ST$|_KG$/);
		expect(results.some((p) => p.categories.length > 0)).toBe(true);
	}, 60000);

	it('adds, sets absolute quantity, reads back, and removes a product (reversible)', async () => {
		await client.clearCart();
		const afterAdd = await client.addToCart(MILK, 2);
		const line = afterAdd.lines.find((l) => l.productId === MILK);
		expect(line?.quantity).toBe(2);
		expect(line?.lineTotal.amount).toBeGreaterThan(0);

		// qty is ABSOLUTE, not additive: setting 3 must yield exactly 3, never 5.
		const after3 = await client.setQuantity(MILK, 3);
		const line3 = after3.lines.find((l) => l.productId === MILK);
		expect(line3?.quantity).toBe(3);

		const afterRemove = await client.removeFromCart(MILK);
		expect(afterRemove.lines.find((l) => l.productId === MILK)).toBeUndefined();
	}, 60000);
});

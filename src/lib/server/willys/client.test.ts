import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import { WillysSession } from './session';
import { WillysClient } from './client';

const LIVE =
	process.env.WILLYS_LIVE === '1' && !!process.env.WILLYS_USERNAME && !!process.env.WILLYS_PASSWORD;
const d = LIVE ? describe : describe.skip;
const MILK = '101233933_ST';

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

	it('adds, reads back, and removes a product (reversible)', async () => {
		await client.clearCart();
		const afterAdd = await client.addToCart(MILK, 2);
		const line = afterAdd.lines.find((l) => l.productId === MILK);
		expect(line?.quantity).toBe(2);
		expect(line?.lineTotal.amount).toBeGreaterThan(0);

		const afterRemove = await client.removeFromCart(MILK);
		expect(afterRemove.lines.find((l) => l.productId === MILK)).toBeUndefined();
	}, 60000);
});

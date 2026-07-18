import { describe, expect, it, beforeAll } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import { WillysSession } from './session';

const LIVE =
	process.env.WILLYS_LIVE === '1' && !!process.env.WILLYS_USERNAME && !!process.env.WILLYS_PASSWORD;
const d = LIVE ? describe : describe.skip;

d('WillysSession (live)', () => {
	let session: WillysSession;
	beforeAll(() => {
		const file = path.join(os.tmpdir(), `willys-test-session-${process.pid}.json`);
		session = new WillysSession(process.env, file);
	});

	it('logs in and reaches a non-anonymous session', async () => {
		await session.ensureAuthenticated();
		const uid = await session.getUid();
		expect(uid).not.toBe('anonymous');
	}, 30000);

	it('reads the cart (authenticated)', async () => {
		const res = await session.read('/axfood/rest/v1/cart');
		expect(res.status).toBe(200);
		const cart = (await res.json()) as { products?: unknown[] };
		expect(Array.isArray(cart.products)).toBe(true);
	}, 30000);
});

import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { WillysSession } from './session';

const LIVE =
	process.env.WILLYS_LIVE === '1' && !!process.env.WILLYS_USERNAME && !!process.env.WILLYS_PASSWORD;
const live = LIVE ? describe : describe.skip;

live('WillysSession (live)', () => {
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

// -----------------------------------------------------------------------------
// Fast, network-free unit tests with a mocked global fetch.
// -----------------------------------------------------------------------------

const ENV = { WILLYS_USERNAME: 'test-user', WILLYS_PASSWORD: 'test-pass' };

/** Build a JSON Response, optionally attaching Set-Cookie headers. */
function jsonResponse(body: unknown, init: { status?: number; cookies?: string[] } = {}): Response {
	const headers: [string, string][] = (init.cookies ?? []).map((c) => ['set-cookie', c]);
	return new Response(JSON.stringify(body), { status: init.status ?? 200, headers });
}

function pathnameOf(url: unknown): string {
	return new URL(String(url)).pathname;
}

describe('WillysSession (mocked)', () => {
	const tmpFiles: string[] = [];

	function tmpFile(name: string): string {
		const file = path.join(
			os.tmpdir(),
			`willys-unit-${name}-${process.pid}-${Math.random().toString(36).slice(2)}.json`
		);
		tmpFiles.push(file);
		return file;
	}

	afterEach(() => {
		vi.unstubAllGlobals();
		for (const f of tmpFiles.splice(0)) {
			try {
				fs.rmSync(f, { force: true });
			} catch {
				/* ignore */
			}
		}
	});

	it('absorbs multiple Set-Cookie headers (value containing "=") and replays them', async () => {
		const calls: { url: unknown; init: RequestInit }[] = [];
		const fetchMock = vi.fn(async (url: unknown, init: RequestInit) => {
			calls.push({ url, init });
			if (calls.length === 1) {
				return jsonResponse(
					{ uid: 'real' },
					{ cookies: ['__Host-csrf-token=x=y; Path=/', 'JSESSIONID=abc; Path=/; HttpOnly'] }
				);
			}
			return jsonResponse({ uid: 'real' });
		});
		vi.stubGlobal('fetch', fetchMock);

		const session = new WillysSession(ENV, tmpFile('absorb'));
		await session.getUid(); // response 1 sets two cookies
		await session.getUid(); // request 2 must replay both

		const replayed = (calls[1].init.headers as Record<string, string>).Cookie;
		expect(replayed).toContain('__Host-csrf-token=x=y');
		expect(replayed).toContain('JSESSIONID=abc');
	});

	it('reuses a valid persisted session without calling /login', async () => {
		const file = tmpFile('reuse');
		fs.writeFileSync(file, JSON.stringify({ cookies: { JSESSIONID: 'persisted-abc' } }));

		const calls: { url: unknown; init: RequestInit }[] = [];
		const fetchMock = vi.fn(async (url: unknown, init: RequestInit) => {
			calls.push({ url, init });
			const p = pathnameOf(url);
			if (p === '/axfood/rest/v1/customer') return jsonResponse({ uid: 'real-user' });
			throw new Error(`unexpected request to ${p}`);
		});
		vi.stubGlobal('fetch', fetchMock);

		const session = new WillysSession(ENV, file);
		await session.ensureAuthenticated();

		const paths = calls.map((c) => pathnameOf(c.url));
		expect(paths).toEqual(['/axfood/rest/v1/customer']);
		expect(paths).not.toContain('/login');
		// persisted cookie was sent
		const sent = calls[0].init.headers as Record<string, string>;
		expect(sent.Cookie).toContain('JSESSIONID=persisted-abc');
	});

	it('re-logs in when the persisted session is anonymous (full sequence)', async () => {
		const file = tmpFile('relogin');
		fs.writeFileSync(file, JSON.stringify({ cookies: { JSESSIONID: 'stale' } }));

		const seq: string[] = [];
		let customerCalls = 0;
		const fetchMock = vi.fn(async (url: unknown) => {
			const p = pathnameOf(url);
			seq.push(p);
			if (p === '/axfood/rest/v1/customer') {
				customerCalls += 1;
				return jsonResponse({ uid: customerCalls === 1 ? 'anonymous' : 'real-user' });
			}
			if (p === '/') return jsonResponse({}, { cookies: ['__Host-csrf-token=tok123; Path=/'] });
			if (p === '/login') return jsonResponse({ login_successful: 'true' });
			throw new Error(`unexpected request to ${p}`);
		});
		vi.stubGlobal('fetch', fetchMock);

		const session = new WillysSession(ENV, file);
		await session.ensureAuthenticated();

		expect(seq).toEqual([
			'/axfood/rest/v1/customer', // persisted-session check → anonymous
			'/', // homepage → csrf cookie
			'/login', // encrypted credential POST
			'/axfood/rest/v1/customer' // post-login uid check → real-user
		]);
	});

	it('persists cookies at mode 0600 and reloads them in a fresh session', async () => {
		const file = tmpFile('persist');

		// First session: fresh login (no persisted file) triggers persist().
		const loginFetch = vi.fn(async (url: unknown) => {
			const p = pathnameOf(url);
			if (p === '/') return jsonResponse({}, { cookies: ['__Host-csrf-token=tok999; Path=/'] });
			if (p === '/login') return jsonResponse({ login_successful: 'true' });
			if (p === '/axfood/rest/v1/customer') return jsonResponse({ uid: 'real-user' });
			throw new Error(`unexpected request to ${p}`);
		});
		vi.stubGlobal('fetch', loginFetch);

		const session1 = new WillysSession(ENV, file);
		await session1.ensureAuthenticated();

		expect(fs.existsSync(file)).toBe(true);
		expect(fs.statSync(file).mode & 0o777).toBe(0o600);
		const persisted = JSON.parse(fs.readFileSync(file, 'utf8')) as {
			cookies: Record<string, string>;
		};
		expect(persisted.cookies['__Host-csrf-token']).toBe('tok999');

		// Second session: reloads persisted cookies, no re-login needed.
		vi.unstubAllGlobals();
		const reloadCalls: { url: unknown; init: RequestInit }[] = [];
		const reloadFetch = vi.fn(async (url: unknown, init: RequestInit) => {
			reloadCalls.push({ url, init });
			const p = pathnameOf(url);
			if (p === '/axfood/rest/v1/customer') return jsonResponse({ uid: 'real-user' });
			throw new Error(`unexpected request to ${p}`);
		});
		vi.stubGlobal('fetch', reloadFetch);

		const session2 = new WillysSession(ENV, file);
		await session2.ensureAuthenticated();

		const paths = reloadCalls.map((c) => pathnameOf(c.url));
		expect(paths).toEqual(['/axfood/rest/v1/customer']);
		const sent = reloadCalls[0].init.headers as Record<string, string>;
		expect(sent.Cookie).toContain('__Host-csrf-token=tok999');
	});

	it('retries a mutation exactly once after a 401 and returns 200', async () => {
		const file = tmpFile('retry');
		fs.writeFileSync(file, JSON.stringify({ cookies: { JSESSIONID: 'persisted-abc' } }));

		let mutationCalls = 0;
		const fetchMock = vi.fn(async (url: unknown) => {
			const p = pathnameOf(url);
			if (p === '/axfood/rest/v1/customer') return jsonResponse({ uid: 'real-user' });
			if (p === '/axfood/rest/v1/csrf-token')
				return new Response('"csrf-token-123"', { status: 200 });
			if (p === '/axfood/rest/v1/cart/addProduct') {
				mutationCalls += 1;
				return jsonResponse(mutationCalls === 1 ? { error: 'unauthorized' } : { ok: true }, {
					status: mutationCalls === 1 ? 401 : 200
				});
			}
			throw new Error(`unexpected request to ${p}`);
		});
		vi.stubGlobal('fetch', fetchMock);

		const session = new WillysSession(ENV, file);
		const res = await session.mutate('/axfood/rest/v1/cart/addProduct?productCodePost=X&qty=1', {
			method: 'POST'
		});

		expect(res.status).toBe(200);
		expect(mutationCalls).toBe(2); // one 401, one successful retry
		const csrfCalls = fetchMock.mock.calls.filter(
			([u]) => pathnameOf(u) === '/axfood/rest/v1/csrf-token'
		).length;
		expect(csrfCalls).toBe(2); // token re-fetched after the 401 reset
	});
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, apiFetch, messageFor, messageForCode } from './client';

afterEach(() => {
	vi.unstubAllGlobals();
});

describe('apiFetch', () => {
	it('returns parsed JSON on success', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }))
		);
		await expect(apiFetch<{ ok: boolean }>('/api/x')).resolves.toEqual({ ok: true });
	});

	it('throws ApiError carrying the wire code and status on HTTP errors', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(
				async () =>
					new Response(JSON.stringify({ error: 'nope', code: 'willys_not_configured' }), {
						status: 503
					})
			)
		);
		const err = await apiFetch('/api/x').catch((e: unknown) => e);
		expect(err).toBeInstanceOf(ApiError);
		expect((err as ApiError).code).toBe('willys_not_configured');
		expect((err as ApiError).status).toBe(503);
	});

	it('throws a network-coded ApiError when fetch itself fails', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => {
				throw new TypeError('fetch failed');
			})
		);
		const err = await apiFetch('/api/x').catch((e: unknown) => e);
		expect(err).toBeInstanceOf(ApiError);
		expect((err as ApiError).code).toBe('network');
	});
});

describe('Swedish error messages', () => {
	it('translates known codes', () => {
		expect(messageFor(new ApiError('willys_not_configured', 'x', 503))).toContain('Inställningar');
		expect(messageForCode('willys_error')).toBe('Kunde inte nå Willys. Försök igen.');
		expect(messageForCode('settings_error')).toContain('inställningarna');
	});

	it('falls back for unknown errors and codes', () => {
		expect(messageFor(new Error('boom'))).toBe('Något gick fel.');
		expect(messageForCode('nonsense')).toBe('Något gick fel.');
	});
});

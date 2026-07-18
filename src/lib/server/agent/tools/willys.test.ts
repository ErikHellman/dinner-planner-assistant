import { describe, expect, it } from 'vitest';
import { createWillysTools } from './willys';
import { WillysConfigError } from '../../willys/config';
import type { WillysClient } from '../../willys/client';

const EXPECTED_NAMES = [
	'willys_search',
	'willys_product',
	'willys_cart_view',
	'willys_cart_add',
	'willys_cart_remove',
	'willys_cart_clear'
];

/** Minimal mock of WillysClient — only the methods a given test exercises. */
function mockClient(overrides: Partial<WillysClient> = {}): WillysClient {
	return overrides as WillysClient;
}

describe('createWillysTools', () => {
	it('returns six tools with the exact expected names', () => {
		const tools = createWillysTools(mockClient());
		expect(tools).toHaveLength(6);
		expect(tools.map((t) => t.name)).toEqual(EXPECTED_NAMES);
	});

	it.each(EXPECTED_NAMES)('%s has a parameters object and an execute function', (name) => {
		const tool = createWillysTools(mockClient()).find((t) => t.name === name);
		expect(tool).toBeDefined();
		expect(tool!.parameters).toBeTypeOf('object');
		expect(tool!.parameters).not.toBeNull();
		expect(tool!.execute).toBeTypeOf('function');
	});

	it('willys_search.execute wraps the client result in content + details', async () => {
		const sentinel = [{ productId: 'X_ST', name: 'sentinel' }];
		const tools = createWillysTools(mockClient({ search: async () => sentinel as never }));
		const search = tools.find((t) => t.name === 'willys_search');
		expect(search).toBeDefined();

		const result = await search!.execute('id', { query: 'x' }, undefined, undefined, {} as never);

		expect(result).toEqual({
			content: [{ type: 'text', text: JSON.stringify(sentinel, null, 2) }],
			details: sentinel
		});
	});

	it('willys_search.execute returns an error result (does not throw) on WillysConfigError', async () => {
		const tools = createWillysTools(
			mockClient({
				search: async () => {
					throw new WillysConfigError();
				}
			})
		);
		const search = tools.find((t) => t.name === 'willys_search');

		const result = await search!.execute('id', { query: 'x' }, undefined, undefined, {} as never);

		expect(result.content).toHaveLength(1);
		expect(result.content[0]).toMatchObject({ type: 'text' });
		expect((result.content[0] as { text: string }).text).toBe(new WillysConfigError().message);
		expect(result.details).toEqual({ error: new WillysConfigError().message });
	});

	it('returns a fail result prefixed "Willys tool error:" on a generic Error (does not throw)', async () => {
		const tools = createWillysTools(
			mockClient({
				getCart: async () => {
					throw new Error('boom');
				}
			})
		);
		const view = tools.find((t) => t.name === 'willys_cart_view');

		const result = await view!.execute('id', {}, undefined, undefined, {} as never);

		const text = (result.content[0] as { text: string }).text;
		expect(text.startsWith('Willys tool error:')).toBe(true);
		expect(text).toContain('boom');
		expect(result.details).toEqual({ error: text });
	});
});

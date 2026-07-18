import { defineTool, type ToolDefinition } from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';
import { WillysClient } from '../../willys/client';
import { WillysConfigError } from '../../willys/config';

function ok(data: unknown): { content: { type: 'text'; text: string }[]; details: unknown } {
	return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }], details: data };
}

function fail(err: unknown): { content: { type: 'text'; text: string }[]; details: unknown } {
	const message =
		err instanceof WillysConfigError
			? err.message
			: `Willys tool error: ${err instanceof Error ? err.message : String(err)}`;
	return { content: [{ type: 'text', text: message }], details: { error: message } };
}

/** Build the native Pi tools that expose the Willys client to the agent. */
export function createWillysTools(client: WillysClient): ToolDefinition[] {
	return [
		defineTool({
			name: 'willys_search',
			label: 'Willys search',
			description:
				'Search Willys groceries. Returns structured products with productId, brand, price, price-per-unit, categories, and stock. Requires configured Willys credentials.',
			promptSnippet: 'willys_search(query): find groceries at Willys',
			parameters: Type.Object({
				query: Type.String({ description: 'Search text, e.g. "mjölk" or "pasta"' }),
				page: Type.Optional(Type.Number({ description: '0-based page', default: 0 })),
				size: Type.Optional(Type.Number({ description: 'Results per page (max 30)', default: 30 }))
			}),
			async execute(_id, params) {
				try {
					return ok(await client.search(params.query, params.page ?? 0, params.size ?? 30));
				} catch (err) {
					return fail(err);
				}
			}
		}),
		defineTool({
			name: 'willys_product',
			label: 'Willys product',
			description:
				'Get detailed info for one Willys product by its productId (e.g. "101233933_ST").',
			promptSnippet: 'willys_product(productId): product detail',
			parameters: Type.Object({ productId: Type.String() }),
			async execute(_id, params) {
				try {
					return ok(await client.product(params.productId));
				} catch (err) {
					return fail(err);
				}
			}
		}),
		defineTool({
			name: 'willys_cart_view',
			label: 'Willys cart',
			description: 'View the current Willys shopping cart (lines, quantities, totals).',
			promptSnippet: 'willys_cart_view(): show the cart',
			parameters: Type.Object({}),
			async execute() {
				try {
					return ok(await client.getCart());
				} catch (err) {
					return fail(err);
				}
			}
		}),
		defineTool({
			name: 'willys_cart_add',
			label: 'Willys add to cart',
			description:
				'Add a product to the Willys cart. quantity is absolute for that product. pickUnit is "pieces" (default) or "kilogram".',
			promptSnippet: 'willys_cart_add(productId, quantity): add to cart',
			parameters: Type.Object({
				productId: Type.String(),
				quantity: Type.Number({ description: 'Absolute quantity to set', default: 1 }),
				pickUnit: Type.Optional(
					Type.Union([Type.Literal('pieces'), Type.Literal('kilogram')], { default: 'pieces' })
				)
			}),
			async execute(_id, params) {
				try {
					return ok(
						await client.setQuantity(params.productId, params.quantity, params.pickUnit ?? 'pieces')
					);
				} catch (err) {
					return fail(err);
				}
			}
		}),
		defineTool({
			name: 'willys_cart_remove',
			label: 'Willys remove from cart',
			description: 'Remove a product from the Willys cart by productId.',
			promptSnippet: 'willys_cart_remove(productId): remove from cart',
			parameters: Type.Object({ productId: Type.String() }),
			async execute(_id, params) {
				try {
					return ok(await client.removeFromCart(params.productId));
				} catch (err) {
					return fail(err);
				}
			}
		}),
		defineTool({
			name: 'willys_cart_clear',
			label: 'Willys clear cart',
			description: 'Remove all products from the Willys cart.',
			promptSnippet: 'willys_cart_clear(): empty the cart',
			parameters: Type.Object({}),
			async execute() {
				try {
					return ok(await client.clearCart());
				} catch (err) {
					return fail(err);
				}
			}
		})
	];
}

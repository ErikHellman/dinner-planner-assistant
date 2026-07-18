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

async function guarded(run: () => Promise<unknown>) {
	try {
		return ok(await run());
	} catch (err) {
		return fail(err);
	}
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
			execute: (_id, params) =>
				guarded(() => client.search(params.query, params.page ?? 0, params.size ?? 30))
		}),
		defineTool({
			name: 'willys_product',
			label: 'Willys product',
			description:
				'Get detailed info for one Willys product by its productId (e.g. "101233933_ST").',
			promptSnippet: 'willys_product(productId): product detail',
			parameters: Type.Object({
				productId: Type.String({ description: 'Willys productId, e.g. "101233933_ST"' })
			}),
			execute: (_id, params) => guarded(() => client.product(params.productId))
		}),
		defineTool({
			name: 'willys_cart_view',
			label: 'Willys cart',
			description: 'View the current Willys shopping cart (lines, quantities, totals).',
			promptSnippet: 'willys_cart_view(): show the cart',
			parameters: Type.Object({}),
			execute: () => guarded(() => client.getCart())
		}),
		defineTool({
			name: 'willys_cart_add',
			label: 'Willys add to cart',
			description:
				'Add a product to the Willys cart. quantity is absolute for that product. pickUnit is "pieces" (default) or "kilogram".',
			promptSnippet: 'willys_cart_add(productId, quantity): add to cart',
			parameters: Type.Object({
				productId: Type.String({ description: 'Willys productId, e.g. "101233933_ST"' }),
				quantity: Type.Number({
					description: 'Absolute quantity to set for this product (0 removes it)',
					default: 1,
					minimum: 0
				}),
				pickUnit: Type.Optional(
					Type.Union([Type.Literal('pieces'), Type.Literal('kilogram')], { default: 'pieces' })
				)
			}),
			execute: (_id, params) =>
				guarded(() =>
					client.setQuantity(params.productId, params.quantity, params.pickUnit ?? 'pieces')
				)
		}),
		defineTool({
			name: 'willys_cart_remove',
			label: 'Willys remove from cart',
			description: 'Remove a product from the Willys cart by productId.',
			promptSnippet: 'willys_cart_remove(productId): remove from cart',
			parameters: Type.Object({
				productId: Type.String({ description: 'Willys productId, e.g. "101233933_ST"' }),
				pickUnit: Type.Optional(
					Type.Union([Type.Literal('pieces'), Type.Literal('kilogram')], { default: 'pieces' })
				)
			}),
			execute: (_id, params) =>
				guarded(() => client.removeFromCart(params.productId, params.pickUnit ?? 'pieces'))
		}),
		defineTool({
			name: 'willys_cart_clear',
			label: 'Willys clear cart',
			description: 'Remove all products from the Willys cart.',
			promptSnippet: 'willys_cart_clear(): empty the cart',
			parameters: Type.Object({}),
			execute: () => guarded(() => client.clearCart())
		})
	];
}

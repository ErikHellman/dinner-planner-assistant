import { WillysConfigError } from './config';

export interface CartMutation {
	productId: string;
	/** Absolute quantity to set for the line; 0 removes it. */
	quantity: number;
	pickUnit: 'pieces' | 'kilogram';
}

// The addProduct qty param counts pieces for every product type — including
// weight-priced _KG lines, whose cart VIEW reports grams. A tight bound stops
// a grams-echoed-as-pieces bug from ordering tens of kilos.
const MAX_QUANTITY = 999;

/** Validate a POST /api/cart/items body; null when malformed. */
export function parseCartMutation(body: unknown): CartMutation | null {
	if (typeof body !== 'object' || body === null) return null;
	const { productId, quantity, pickUnit = 'pieces' } = body as Record<string, unknown>;
	if (typeof productId !== 'string' || !productId.trim() || productId.length > 100) return null;
	if (pickUnit !== 'pieces' && pickUnit !== 'kilogram') return null;
	if (typeof quantity !== 'number' || !Number.isFinite(quantity)) return null;
	if (quantity < 0 || quantity > MAX_QUANTITY) return null;
	if (pickUnit === 'pieces' && !Number.isInteger(quantity)) return null;
	return { productId, quantity, pickUnit };
}

/** HTTP status + wire code for a failed Willys call (Swedish text lives client-side). */
export function willysErrorStatus(err: unknown): { status: number; code: string } {
	if (err instanceof WillysConfigError) {
		return { status: 503, code: 'willys_not_configured' };
	}
	return { status: 502, code: 'willys_error' };
}

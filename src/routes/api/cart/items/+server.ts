import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { parseCartMutation, willysErrorStatus } from '$lib/server/willys/api';
import { getWillysClient } from '$lib/server/willys/shared';

/** Set the absolute quantity of a cart line (0 removes it). Returns the updated cart. */
export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json().catch(() => null);
	const mutation = parseCartMutation(body);
	if (!mutation) {
		return json(
			{ error: 'Expected {productId, quantity >= 0, pickUnit?}', code: 'bad_request' },
			{ status: 400 }
		);
	}
	try {
		const cart = await getWillysClient().setQuantity(
			mutation.productId,
			mutation.quantity,
			mutation.pickUnit
		);
		return json(cart);
	} catch (err) {
		const { status, code } = willysErrorStatus(err);
		return json({ error: err instanceof Error ? err.message : String(err), code }, { status });
	}
};

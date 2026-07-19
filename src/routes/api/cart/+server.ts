import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { willysErrorStatus } from '$lib/server/willys/api';
import { getWillysClient } from '$lib/server/willys/shared';

function failure(err: unknown) {
	const { status, code } = willysErrorStatus(err);
	return json({ error: err instanceof Error ? err.message : String(err), code }, { status });
}

/** Live Willys cart. */
export const GET: RequestHandler = async () => {
	try {
		return json(await getWillysClient().getCart());
	} catch (err) {
		return failure(err);
	}
};

/** Clear the entire Willys cart. */
export const DELETE: RequestHandler = async () => {
	try {
		return json(await getWillysClient().clearCart());
	} catch (err) {
		return failure(err);
	}
};

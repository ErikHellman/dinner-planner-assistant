import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { VerdictStore, VerdictStoreError } from '$lib/server/verdicts/store';

const store = new VerdictStore();

/** Every recipe the user has judged, keyed by recipeId. */
export const GET: RequestHandler = async () => {
	try {
		const { verdicts } = await store.load();
		return json({ verdicts });
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return json(
			{ error: message, code: err instanceof VerdictStoreError ? 'verdicts_corrupt' : 'io_error' },
			{ status: 500 }
		);
	}
};

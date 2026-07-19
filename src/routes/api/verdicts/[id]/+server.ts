import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { defaultRecipesDir, RecipeQueryError, RecipeStore } from '$lib/server/recipes/query';
import { isVerdict, VerdictStore, VerdictStoreError } from '$lib/server/verdicts/store';

const store = new VerdictStore();
const recipes = new RecipeStore(defaultRecipesDir());

function ioError(err: unknown) {
	const message = err instanceof Error ? err.message : String(err);
	return json(
		{ error: message, code: err instanceof VerdictStoreError ? 'verdicts_corrupt' : 'io_error' },
		{ status: 500 }
	);
}

/** Set or clear one recipe's verdict. `{ verdict: null }` clears it. */
export const PUT: RequestHandler = async ({ params, request }) => {
	if (!/^\d{1,10}$/.test(params.id)) {
		return json(
			{ error: 'recipeId must be a positive integer', code: 'bad_request' },
			{ status: 400 }
		);
	}
	const body = (await request.json().catch(() => null)) as { verdict?: unknown } | null;
	if (!body || !(body.verdict === null || isVerdict(body.verdict))) {
		return json(
			{ error: 'Expected { verdict: "liked" | "vetoed" | null }', code: 'bad_request' },
			{ status: 400 }
		);
	}

	const recipeId = Number(params.id);
	try {
		if (body.verdict === null) {
			return json({ verdicts: (await store.clear(recipeId)).verdicts });
		}
		// The name is denormalized into the document so the system prompt can
		// list judged recipes without loading every recipe file.
		const recipe = await recipes.get(recipeId);
		return json({ verdicts: (await store.set(recipeId, body.verdict, recipe.name)).verdicts });
	} catch (err) {
		if (err instanceof RecipeQueryError) {
			return json({ error: err.message, code: 'not_found' }, { status: 404 });
		}
		return ioError(err);
	}
};

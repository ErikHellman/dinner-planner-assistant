import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { recipeImageUrl } from '$lib/server/recipes/images';
import { decodeHtmlText } from '$lib/server/recipes/normalize';
import { defaultRecipesDir, RecipeQueryError, RecipeStore } from '$lib/server/recipes/query';
import type { RecipeDetails } from '$lib/recipes/types';

const store = new RecipeStore(defaultRecipesDir());

const decode = (text: string | null): string | null =>
	text === null ? null : decodeHtmlText(text);

/** Full recipe document, entity-decoded at serve time (114 harvested docs
 * still contain &deg; and friends), with browser image URLs attached. */
export const GET: RequestHandler = async ({ params }) => {
	if (!/^\d{1,10}$/.test(params.id)) {
		return json(
			{ error: 'recipeId must be a positive integer', code: 'bad_request' },
			{ status: 400 }
		);
	}
	try {
		const doc = await store.get(Number(params.id));
		const details: RecipeDetails = {
			...doc,
			name: decode(doc.name) ?? doc.name,
			headline: decode(doc.headline),
			subheadline: decode(doc.subheadline),
			description: decode(doc.description),
			chefTip: decode(doc.chefTip),
			instructions: doc.instructions.map((i) => ({ ...i, text: decodeHtmlText(i.text) })),
			imageLarge: recipeImageUrl(doc, 'large'),
			imageSmall: recipeImageUrl(doc, 'small')
		};
		return json(details);
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		if (err instanceof RecipeQueryError && message.includes('not found')) {
			return json({ error: message, code: 'not_found' }, { status: 404 });
		}
		return json({ error: message, code: 'recipes_unavailable' }, { status: 500 });
	}
};

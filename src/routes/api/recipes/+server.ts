import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { recipeImageUrl } from '$lib/server/recipes/images';
import { defaultRecipesDir, RecipeStore } from '$lib/server/recipes/query';
import type { BrowseRecipe } from '$lib/recipes/types';

const store = new RecipeStore(defaultRecipesDir());

/** Compact list of every recipe for the browse grid (~200 entries). */
export const GET: RequestHandler = async () => {
	try {
		const docs = await store.loadAll();
		const recipes: BrowseRecipe[] = docs
			.map((doc) => ({
				recipeId: doc.recipeId,
				name: doc.name,
				headline: doc.headline,
				mainIngredient: doc.mainIngredient,
				categories: doc.categories,
				cookingTime: doc.cookingTime,
				energyKcalPerServing: doc.nutritionPerServing?.energyKcal ?? null,
				rating: doc.rating,
				imageSmall: recipeImageUrl(doc, 'small')
			}))
			.sort((a, b) => a.name.localeCompare(b.name, 'sv') || a.recipeId - b.recipeId);
		return json({ recipes });
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return json({ error: message, code: 'recipes_unavailable' }, { status: 500 });
	}
};

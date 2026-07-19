import { recipeImageUrl } from '../recipes/images';
import { RecipeQueryError, type RecipeStore } from '../recipes/query';
import type { PlanRecipeView } from '../../plans/types';

/** Join a plan's recipe refs against the database for display. Duplicates and
 * order are preserved; a recipe removed by a re-harvest falls back to the name
 * stored in the plan with exists: false. */
export async function buildPlanRecipeViews(
	recipes: { recipeId: number; name: string }[],
	store: RecipeStore
): Promise<PlanRecipeView[]> {
	return Promise.all(
		recipes.map(async ({ recipeId, name }) => {
			try {
				const doc = await store.get(recipeId);
				return {
					recipeId,
					name: doc.name,
					exists: true,
					headline: doc.headline,
					mainIngredient: doc.mainIngredient,
					cookingTime: doc.cookingTime,
					energyKcalPerServing: doc.nutritionPerServing?.energyKcal ?? null,
					rating: doc.rating,
					imageSmall: recipeImageUrl(doc, 'small')
				};
			} catch (err) {
				if (!(err instanceof RecipeQueryError)) throw err;
				return {
					recipeId,
					name,
					exists: false,
					headline: null,
					mainIngredient: null,
					cookingTime: null,
					energyKcalPerServing: null,
					rating: null,
					imageSmall: null
				};
			}
		})
	);
}

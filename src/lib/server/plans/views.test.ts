import { describe, expect, it } from 'vitest';
import { buildPlanRecipeViews } from './views';
import { RecipeQueryError, type RecipeStore } from '../recipes/query';
import type { RecipeDoc } from '../recipes/types';

const DOC = {
	recipeId: 1,
	name: 'Varmrökt lax med dillsås',
	headline: 'Varmrökt lax',
	mainIngredient: 'Fisk',
	cookingTime: { min: 15, max: 20 },
	nutritionPerServing: { energyKcal: 500, protein: 30, carbs: 40, fat: 20 },
	rating: { average: 4.2, count: 100 },
	images: { large: 'images/1-large.jpg', small: 'images/1-small.jpg' },
	source: { url: 'https://example.test', harvestedAt: '2026-07-18T00:00:00.000Z' }
} as RecipeDoc;

function stubStore(): RecipeStore {
	return {
		get: async (recipeId: number) => {
			if (recipeId === 1) return DOC;
			throw new RecipeQueryError(`Recipe ${recipeId} not found`);
		}
	} as RecipeStore;
}

describe('buildPlanRecipeViews', () => {
	it('joins existing recipes with display fields and image URLs', async () => {
		const views = await buildPlanRecipeViews([{ recipeId: 1, name: 'Gammalt namn' }], stubStore());

		expect(views).toHaveLength(1);
		expect(views[0]).toMatchObject({
			recipeId: 1,
			exists: true,
			name: 'Varmrökt lax med dillsås', // fresh name from the database
			headline: 'Varmrökt lax',
			energyKcalPerServing: 500
		});
		expect(views[0].imageSmall).toContain('/api/recipes/1/image?size=small');
	});

	it('falls back to the plan name for recipes removed from the database', async () => {
		const views = await buildPlanRecipeViews(
			[{ recipeId: 999, name: 'Försvunnen gryta' }],
			stubStore()
		);

		expect(views[0]).toEqual({
			recipeId: 999,
			name: 'Försvunnen gryta',
			exists: false,
			headline: null,
			mainIngredient: null,
			cookingTime: null,
			energyKcalPerServing: null,
			rating: null,
			imageSmall: null
		});
	});

	it('preserves duplicates and order (same dish twice that week)', async () => {
		const views = await buildPlanRecipeViews(
			[
				{ recipeId: 1, name: 'A' },
				{ recipeId: 999, name: 'B' },
				{ recipeId: 1, name: 'A' }
			],
			stubStore()
		);

		expect(views.map((v) => [v.recipeId, v.exists])).toEqual([
			[1, true],
			[999, false],
			[1, true]
		]);
	});
});

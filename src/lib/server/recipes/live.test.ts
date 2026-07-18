import { describe, expect, it } from 'vitest';
import { normalizeRecipe } from './normalize';
import { fetchListingPage, fetchRecipeDetail } from './scrape';

const live = process.env.RECIPES_LIVE === '1';

describe.runIf(live)('linasmatkasse.se live contract', () => {
	it('serves the kalorisnål listing with recipes and pagination', async () => {
		const listing = await fetchListingPage(1);
		expect(listing.totalPages).toBeGreaterThanOrEqual(1);
		expect(listing.recipes?.length).toBeGreaterThan(0);
		expect(typeof listing.recipes?.[0]?.recipeId).toBe('number');
	}, 30_000);

	it('serves a recipe detail that normalizes to a 2-serving document', async () => {
		const listing = await fetchListingPage(1);
		const recipeId = listing.recipes?.[0]?.recipeId as number;
		const raw = await fetchRecipeDetail(recipeId);
		const doc = normalizeRecipe(raw, {
			images: { large: null, small: null },
			harvestedAt: new Date().toISOString()
		});
		expect(doc.recipeId).toBe(recipeId);
		expect(doc.servings).toBe(2);
		expect(doc.ingredients.length).toBeGreaterThan(0);
		expect(doc.instructions.length).toBeGreaterThan(0);
		expect(doc.categories.length).toBeGreaterThan(0);
	}, 30_000);
});

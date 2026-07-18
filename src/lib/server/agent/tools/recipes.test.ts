import { mkdtemp, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { createRecipeTools } from './recipes';
import { RecipeStore } from '../../recipes/query';
import type { RecipeDoc } from '../../recipes/types';

const EXPECTED_NAMES = ['recipe_search', 'recipe_get', 'recipe_ingredients'];

const LAX: RecipeDoc = {
	recipeId: 1,
	name: 'Varmrökt lax med dillsås',
	mainRecipeId: null,
	headline: null,
	subheadline: null,
	description: null,
	chefTip: null,
	mainIngredient: 'Fisk',
	servings: 2,
	cookingTime: { min: 15, max: 20 },
	categories: ['Fisk och skaldjur'],
	allergies: [],
	nutritionPerServing: null,
	co2eKgPerServing: null,
	rating: { average: null, count: null },
	ingredients: [],
	instructions: [],
	images: { large: null, small: null },
	source: { url: 'https://example.test', harvestedAt: '2026-07-18T00:00:00.000Z' }
};

let store: RecipeStore;

beforeAll(async () => {
	const dir = await mkdtemp(path.join(os.tmpdir(), 'recipe-tools-test-'));
	await writeFile(path.join(dir, '1.json'), JSON.stringify(LAX));
	store = new RecipeStore(dir);
});

/** Minimal stub of RecipeStore — only the methods a given test exercises. */
function stubStore(overrides: Partial<RecipeStore> = {}): RecipeStore {
	return overrides as RecipeStore;
}

describe('createRecipeTools', () => {
	it('returns three tools with the exact expected names', () => {
		const tools = createRecipeTools(stubStore());
		expect(tools).toHaveLength(3);
		expect(tools.map((t) => t.name)).toEqual(EXPECTED_NAMES);
	});

	it.each(EXPECTED_NAMES)('%s has a parameters object and an execute function', (name) => {
		const tool = createRecipeTools(stubStore()).find((t) => t.name === name);
		expect(tool).toBeDefined();
		expect(tool!.parameters).toBeTypeOf('object');
		expect(tool!.parameters).not.toBeNull();
		expect(tool!.execute).toBeTypeOf('function');
	});

	it('recipe_get.execute wraps the recipe document in content + details', async () => {
		const tools = createRecipeTools(store);
		const get = tools.find((t) => t.name === 'recipe_get');
		expect(get).toBeDefined();

		const result = await get!.execute('id', { recipeId: 1 }, undefined, undefined, {} as never);

		expect(JSON.parse((result.content[0] as { text: string }).text)).toEqual(LAX);
		expect(result.details).toEqual(LAX);
	});

	it('recipe_get.execute returns an error result (does not throw) on RecipeQueryError', async () => {
		const tools = createRecipeTools(store);
		const get = tools.find((t) => t.name === 'recipe_get');

		const result = await get!.execute('id', { recipeId: 999 }, undefined, undefined, {} as never);

		const text = (result.content[0] as { text: string }).text;
		expect(text).toContain('not found');
		expect(text.startsWith('Recipe tool error:')).toBe(false);
		expect(result.details).toEqual({ error: text });
	});

	it('returns a fail result prefixed "Recipe tool error:" on a generic Error (does not throw)', async () => {
		const tools = createRecipeTools(
			stubStore({
				search: async () => {
					throw new Error('boom');
				}
			})
		);
		const search = tools.find((t) => t.name === 'recipe_search');

		const result = await search!.execute('id', {}, undefined, undefined, {} as never);

		const text = (result.content[0] as { text: string }).text;
		expect(text.startsWith('Recipe tool error:')).toBe(true);
		expect(text).toContain('boom');
		expect(result.details).toEqual({ error: text });
	});
});

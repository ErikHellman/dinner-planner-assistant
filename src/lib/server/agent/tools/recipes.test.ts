import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { createRecipeTools } from './recipes';
import { RecipeStore } from '../../recipes/query';
import type { RecipeDoc } from '../../recipes/types';

const EXPECTED_NAMES = ['recipe_search', 'recipe_get', 'recipe_ingredients', 'recipe_aggregate'];

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
	ingredients: [
		{
			section: null,
			name: 'Gul lök',
			amount: 150,
			unit: 'g',
			raw: '150 g gul lök',
			isBasis: false
		},
		{ section: null, name: 'salt', amount: null, unit: null, raw: 'salt', isBasis: true }
	],
	instructions: [],
	images: { large: null, small: null },
	source: { url: 'https://example.test', harvestedAt: '2026-07-18T00:00:00.000Z' }
};

const KYCKLING: RecipeDoc = {
	...LAX,
	recipeId: 2,
	name: 'Kycklinggryta',
	mainIngredient: 'Kött',
	categories: ['Kött'],
	ingredients: [
		{ section: null, name: 'gul lök', amount: 100, unit: 'g', raw: '100 g gul lök', isBasis: false }
	]
};

let store: RecipeStore;
let tmpDir: string;

beforeAll(async () => {
	tmpDir = await mkdtemp(path.join(os.tmpdir(), 'recipe-tools-test-'));
	await writeFile(path.join(tmpDir, '1.json'), JSON.stringify(LAX));
	await writeFile(path.join(tmpDir, '2.json'), JSON.stringify(KYCKLING));
	store = new RecipeStore(tmpDir);
});

/** Minimal stub of RecipeStore — only the methods a given test exercises. */
function stubStore(overrides: Partial<RecipeStore> = {}): RecipeStore {
	return overrides as RecipeStore;
}

describe('createRecipeTools', () => {
	it('returns four tools with the exact expected names', () => {
		const tools = createRecipeTools(stubStore());
		expect(tools).toHaveLength(4);
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

	it('recipe_aggregate merges ingredients, scales servings, and writes the list file', async () => {
		const outPath = path.join(tmpDir, 'out', 'shopping-list.json');
		const tools = createRecipeTools(store, { shoppingListPath: outPath });
		const aggregate = tools.find((t) => t.name === 'recipe_aggregate');

		const result = await aggregate!.execute(
			'id',
			{ recipeIds: [1, 2], servings: 4 },
			undefined,
			undefined,
			{} as never
		);

		const details = result.details as {
			servings: number;
			items: { name: string; amounts: { value: number; unit: string }[] }[];
			pantryStaples: { name: string }[];
		};
		expect(details.servings).toBe(4);
		expect(details.items).toHaveLength(1);
		expect(details.items[0].name).toBe('Gul lök');
		expect(details.items[0].amounts[0]).toMatchObject({ value: 500, unit: 'g' });
		expect(details.pantryStaples.map((i) => i.name)).toEqual(['salt']);
		expect(JSON.parse(await readFile(outPath, 'utf8'))).toEqual(details);
	});

	it('recipe_aggregate defaults to 2 servings', async () => {
		const outPath = path.join(tmpDir, 'out2', 'shopping-list.json');
		const tools = createRecipeTools(store, { shoppingListPath: outPath });
		const aggregate = tools.find((t) => t.name === 'recipe_aggregate');

		const result = await aggregate!.execute(
			'id',
			{ recipeIds: [1] },
			undefined,
			undefined,
			{} as never
		);

		expect((result.details as { servings: number }).servings).toBe(2);
	});

	it('recipe_aggregate returns store errors verbatim (no generic prefix)', async () => {
		const tools = createRecipeTools(store, {
			shoppingListPath: path.join(tmpDir, 'out3', 'shopping-list.json')
		});
		const aggregate = tools.find((t) => t.name === 'recipe_aggregate');

		const result = await aggregate!.execute(
			'id',
			{ recipeIds: [999] },
			undefined,
			undefined,
			{} as never
		);

		const text = (result.content[0] as { text: string }).text;
		expect(text).toContain('not found');
		expect(text.startsWith('Recipe tool error:')).toBe(false);
	});

	it('recipe_aggregate returns RecipeAggregateError messages verbatim', async () => {
		const tools = createRecipeTools(store, {
			shoppingListPath: path.join(tmpDir, 'out4', 'shopping-list.json')
		});
		const aggregate = tools.find((t) => t.name === 'recipe_aggregate');

		const result = await aggregate!.execute(
			'id',
			{ recipeIds: [1], servings: 0 },
			undefined,
			undefined,
			{} as never
		);

		const text = (result.content[0] as { text: string }).text;
		expect(text).toContain('servings must be a positive integer');
		expect(text.startsWith('Recipe tool error:')).toBe(false);
	});
});

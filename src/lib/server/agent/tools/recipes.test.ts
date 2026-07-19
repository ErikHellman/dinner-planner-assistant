import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createRecipeTools } from './recipes';
import { RecipeStore } from '../../recipes/query';
import { PlanStore } from '../../plans/store';
import { currentWeekId } from '../../../plans/week';
import type { WeeklyPlan, WillysCartSnapshot } from '../../../plans/types';
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

const SNAPSHOT: WillysCartSnapshot = {
	recordedAt: '2026-07-19T11:00:00.000Z',
	store: { id: '2583' },
	itemCount: 1,
	totalQuantity: 1,
	lines: [
		{
			productId: '1_ST',
			name: 'Gul lök',
			brand: null,
			quantity: 1,
			pickUnit: 'pieces',
			unitPrice: { amount: 5, formatted: '5,00 kr', currency: 'SEK' },
			lineTotal: { amount: 5, formatted: '5,00 kr', currency: 'SEK' },
			categories: [],
			displaySize: null,
			imageUrl: null
		}
	],
	subtotal: { amount: 5, formatted: '5,00 kr', currency: 'SEK' },
	coverage: []
};

let store: RecipeStore;
let plans: PlanStore;
let plansDir: string;

beforeAll(async () => {
	const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'recipe-tools-test-'));
	await writeFile(path.join(tmpDir, '1.json'), JSON.stringify(LAX));
	await writeFile(path.join(tmpDir, '2.json'), JSON.stringify(KYCKLING));
	store = new RecipeStore(tmpDir);
});

beforeEach(async () => {
	plansDir = await mkdtemp(path.join(os.tmpdir(), 'recipe-tools-plans-'));
	plans = new PlanStore(plansDir);
});

/** Minimal stub of RecipeStore — only the methods a given test exercises. */
function stubStore(overrides: Partial<RecipeStore> = {}): RecipeStore {
	return overrides as RecipeStore;
}

function makeTools(recipeStore: RecipeStore) {
	return createRecipeTools(recipeStore, { plans });
}

async function runAggregate(recipeStore: RecipeStore, params: unknown) {
	const aggregate = makeTools(recipeStore).find((t) => t.name === 'recipe_aggregate');
	return aggregate!.execute('id', params as never, undefined, undefined, {} as never);
}

describe('createRecipeTools', () => {
	it('returns four tools with the exact expected names', () => {
		const tools = makeTools(stubStore());
		expect(tools).toHaveLength(4);
		expect(tools.map((t) => t.name)).toEqual(EXPECTED_NAMES);
	});

	it.each(EXPECTED_NAMES)('%s has a parameters object and an execute function', (name) => {
		const tool = makeTools(stubStore()).find((t) => t.name === name);
		expect(tool).toBeDefined();
		expect(tool!.parameters).toBeTypeOf('object');
		expect(tool!.parameters).not.toBeNull();
		expect(tool!.execute).toBeTypeOf('function');
	});

	it('recipe_get.execute wraps the recipe document in content + details', async () => {
		const tools = makeTools(store);
		const get = tools.find((t) => t.name === 'recipe_get');
		expect(get).toBeDefined();

		const result = await get!.execute('id', { recipeId: 1 }, undefined, undefined, {} as never);

		expect(JSON.parse((result.content[0] as { text: string }).text)).toEqual(LAX);
		expect(result.details).toEqual(LAX);
	});

	it('recipe_get.execute returns an error result (does not throw) on RecipeQueryError', async () => {
		const tools = makeTools(store);
		const get = tools.find((t) => t.name === 'recipe_get');

		const result = await get!.execute('id', { recipeId: 999 }, undefined, undefined, {} as never);

		const text = (result.content[0] as { text: string }).text;
		expect(text).toContain('not found');
		expect(text.startsWith('Recipe tool error:')).toBe(false);
		expect(result.details).toEqual({ error: text });
	});

	it('returns a fail result prefixed "Recipe tool error:" on a generic Error (does not throw)', async () => {
		const tools = makeTools(
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

	it('recipe_aggregate builds the weekly plan and writes the <week>.json document', async () => {
		const result = await runAggregate(store, { recipeIds: [1, 2], servings: 4, week: '2026-W30' });

		const plan = result.details as WeeklyPlan;
		expect(plan.weekId).toBe('2026-W30');
		expect(plan.servings).toBe(4);
		expect(plan.recipes.map((r) => r.recipeId)).toEqual([1, 2]);
		expect(plan.shoppingList.items).toHaveLength(1);
		expect(plan.shoppingList.items[0].name).toBe('Gul lök');
		expect(plan.shoppingList.items[0].amounts[0]).toMatchObject({ value: 500, unit: 'g' });
		expect(plan.shoppingList.pantryStaples.map((i) => i.name)).toEqual(['salt']);
		expect(plan.willysCart).toBeNull();

		const onDisk = JSON.parse(await readFile(path.join(plansDir, '2026-W30.json'), 'utf8'));
		expect(onDisk).toEqual(plan);
	});

	it('recipe_aggregate defaults to 2 servings and the current week', async () => {
		const result = await runAggregate(store, { recipeIds: [1] });

		const plan = result.details as WeeklyPlan;
		expect(plan.servings).toBe(2);
		expect(plan.weekId).toBe(currentWeekId());
	});

	it('recipe_aggregate resets a previously recorded Willys snapshot on re-aggregate', async () => {
		await runAggregate(store, { recipeIds: [1], week: '2026-W31' });
		await plans.setWillysSnapshot('2026-W31', SNAPSHOT);

		const result = await runAggregate(store, { recipeIds: [1, 2], week: '2026-W31' });

		expect((result.details as WeeklyPlan).willysCart).toBeNull();
		const onDisk = JSON.parse(
			await readFile(path.join(plansDir, '2026-W31.json'), 'utf8')
		) as WeeklyPlan;
		expect(onDisk.willysCart).toBeNull();
	});

	it('recipe_aggregate returns PlanStoreError messages verbatim for a bad week id', async () => {
		const result = await runAggregate(store, { recipeIds: [1], week: '2026-W99' });

		const text = (result.content[0] as { text: string }).text;
		expect(text).toContain('Invalid week id');
		expect(text.startsWith('Recipe tool error:')).toBe(false);
	});

	it('recipe_aggregate returns store errors verbatim (no generic prefix)', async () => {
		const result = await runAggregate(store, { recipeIds: [999] });

		const text = (result.content[0] as { text: string }).text;
		expect(text).toContain('not found');
		expect(text.startsWith('Recipe tool error:')).toBe(false);
	});

	it('recipe_aggregate returns RecipeAggregateError messages verbatim', async () => {
		const result = await runAggregate(store, { recipeIds: [1], servings: 0 });

		const text = (result.content[0] as { text: string }).text;
		expect(text).toContain('servings must be a positive integer');
		expect(text.startsWith('Recipe tool error:')).toBe(false);
	});
});

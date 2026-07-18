import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { RecipeQueryError, RecipeStore } from './query';
import type { RecipeDoc } from './types';

function doc(overrides: Partial<RecipeDoc> & { recipeId: number; name: string }): RecipeDoc {
	return {
		mainRecipeId: null,
		headline: null,
		subheadline: null,
		description: null,
		chefTip: null,
		mainIngredient: null,
		servings: 2,
		cookingTime: { min: 15, max: 20 },
		categories: [],
		allergies: [],
		nutritionPerServing: null,
		co2eKgPerServing: null,
		rating: { average: null, count: null },
		ingredients: [],
		instructions: [],
		images: { large: null, small: null },
		source: { url: 'https://example.test', harvestedAt: '2026-07-18T00:00:00.000Z' },
		...overrides
	};
}

const LAX = doc({
	recipeId: 1,
	name: 'Varmrökt lax med dillsås',
	mainIngredient: 'Fisk',
	categories: ['Fisk och skaldjur', 'Kalorisnål'],
	cookingTime: { min: 15, max: 20 },
	nutritionPerServing: { energyKcal: 556, protein: 29.5, carbs: 53.4, fat: 25 },
	ingredients: [
		{
			section: null,
			name: 'varmrökt lax',
			amount: 200,
			unit: 'g',
			raw: '200 g varmrökt lax',
			isBasis: false
		}
	]
});

const BOWL = doc({
	recipeId: 2,
	name: 'Tex-mex bowl med zucchini',
	mainIngredient: 'Vegetariskt',
	categories: ['Vegetariskt', 'Tex-Mex'],
	cookingTime: { min: 20, max: 30 },
	nutritionPerServing: { energyKcal: 700, protein: 20, carbs: 80, fat: 30 },
	ingredients: [
		{
			section: null,
			name: 'zucchini',
			amount: 1,
			unit: 'st',
			raw: '1 st zucchini',
			isBasis: false
		},
		{
			section: null,
			name: 'svarta bönor',
			amount: 1,
			unit: 'förp',
			raw: '1 förp svarta bönor',
			isBasis: false
		}
	]
});

const SOPPA = doc({
	recipeId: 3,
	name: 'Örtig köttsoppa',
	mainIngredient: 'Kött',
	categories: ['Soppa'],
	cookingTime: { min: 30, max: 45 }
});

let store: RecipeStore;

beforeAll(async () => {
	const dir = await mkdtemp(path.join(os.tmpdir(), 'recipes-test-'));
	await mkdir(path.join(dir, 'images'), { recursive: true });
	await writeFile(path.join(dir, '1.json'), JSON.stringify(LAX));
	await writeFile(path.join(dir, '2.json'), JSON.stringify(BOWL));
	await writeFile(path.join(dir, '3.json'), JSON.stringify(SOPPA));
	await writeFile(path.join(dir, 'notes.txt'), 'not a recipe');
	store = new RecipeStore(dir);
});

describe('search', () => {
	it('returns all recipes as compact hits when no filters given', async () => {
		const hits = await store.search();
		// Swedish collation: T < V < Ö (Ö sorts after Z, not near O as in the default locale).
		expect(hits.map((h) => h.recipeId)).toEqual([2, 1, 3]);
		expect(hits[1]).toEqual({
			recipeId: 1,
			name: 'Varmrökt lax med dillsås',
			mainIngredient: 'Fisk',
			categories: ['Fisk och skaldjur', 'Kalorisnål'],
			cookingTime: { min: 15, max: 20 },
			energyKcalPerServing: 556,
			rating: { average: null, count: null }
		});
	});

	it('matches query against name and ingredient names, diacritic-insensitively', async () => {
		expect((await store.search({ query: 'DILLSAS' })).map((h) => h.recipeId)).toEqual([1]);
		expect((await store.search({ query: 'bonor' })).map((h) => h.recipeId)).toEqual([2]);
	});

	it('matches category against categories and mainIngredient', async () => {
		expect((await store.search({ category: 'vegetariskt' })).map((h) => h.recipeId)).toEqual([2]);
		expect((await store.search({ category: 'fisk' })).map((h) => h.recipeId)).toEqual([1]);
	});

	it('applies numeric filters and ANDs everything', async () => {
		expect((await store.search({ maxTimeMinutes: 20 })).map((h) => h.recipeId)).toEqual([1]);
		expect((await store.search({ maxKcal: 600 })).map((h) => h.recipeId)).toEqual([1]);
		expect(await store.search({ query: 'lax', maxKcal: 500 })).toEqual([]);
	});
});

describe('get / ingredients', () => {
	it('returns the full document', async () => {
		expect((await store.get(1)).name).toBe('Varmrökt lax med dillsås');
	});

	it('throws RecipeQueryError for unknown ids', async () => {
		await expect(store.get(999)).rejects.toThrow(RecipeQueryError);
		await expect(store.get(999)).rejects.toThrow(/999/);
	});

	it('rejects non-positive and non-integer ids without touching the filesystem', async () => {
		await expect(store.get(-1)).rejects.toThrow(RecipeQueryError);
		await expect(store.get(-1)).rejects.toThrow(/not found/);
		await expect(store.get(1.5)).rejects.toThrow(RecipeQueryError);
		await expect(store.get(1.5)).rejects.toThrow(/not found/);
	});

	it('returns ingredient lists for multiple recipes', async () => {
		const lists = await store.ingredients([1, 2]);
		expect(lists).toHaveLength(2);
		expect(lists[0]).toEqual({
			recipeId: 1,
			name: 'Varmrökt lax med dillsås',
			servings: 2,
			ingredients: LAX.ingredients
		});
	});
});

describe('corrupt documents', () => {
	it('names the offending file when a document fails to parse', async () => {
		const dir = await mkdtemp(path.join(os.tmpdir(), 'recipes-corrupt-'));
		await writeFile(path.join(dir, '7.json'), '{"recipeId": 7, "name": "trunc');
		const broken = new RecipeStore(dir);
		await expect(broken.search()).rejects.toThrow(RecipeQueryError);
		await expect(broken.search()).rejects.toThrow(/7\.json/);
	});

	it('rejects documents missing required fields', async () => {
		const dir = await mkdtemp(path.join(os.tmpdir(), 'recipes-invalid-'));
		await writeFile(path.join(dir, '8.json'), '{}');
		const broken = new RecipeStore(dir);
		await expect(broken.search()).rejects.toThrow(RecipeQueryError);
		await expect(broken.search()).rejects.toThrow(/8\.json/);
	});

	it('distinguishes unreadable documents from missing ones in get()', async () => {
		const dir = await mkdtemp(path.join(os.tmpdir(), 'recipes-get-corrupt-'));
		await writeFile(path.join(dir, '9.json'), 'not json at all');
		const broken = new RecipeStore(dir);
		const err = await broken.get(9).then(
			() => {
				throw new Error('expected get(9) to reject');
			},
			(e: unknown) => e
		);
		expect(err).toBeInstanceOf(RecipeQueryError);
		expect((err as Error).message).toMatch(/could not be read/);
		expect((err as Error).message).not.toMatch(/not found/);
	});
});

describe('missing database', () => {
	it('explains how to build the database when the directory is absent', async () => {
		const empty = new RecipeStore(path.join(os.tmpdir(), 'recipes-does-not-exist'));
		await expect(empty.search()).rejects.toThrow(/harvest/);
	});

	it('explains how to build the database when the directory is empty', async () => {
		const dir = await mkdtemp(path.join(os.tmpdir(), 'recipes-empty-'));
		const empty = new RecipeStore(dir);
		await expect(empty.search()).rejects.toThrow(/No recipes found/);
	});
});

import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import recipeFixture from './fixtures/recipe-and-steps.json';
import { fakeFetch, listingHtml, recipeHtml } from './fixtures/helpers';
import { harvest } from './harvest';
import type { RawRecipeAndSteps, RecipeDoc } from './types';

const BASE = 'https://www.linasmatkasse.se';
const IMG_SMALL = 'https://pimimages.azureedge.net/images/resized/aaa.jpg';
const IMG_LARGE = 'https://pimimages.azureedge.net/images/largeResized/aaa.jpg';

function recipeWithId(recipeId: number): RawRecipeAndSteps {
	return { ...(recipeFixture as RawRecipeAndSteps), recipeId };
}

function listing(page: number, totalPages: number, ids: number[]) {
	return listingHtml({
		page,
		totalPages,
		recipes: ids.map((recipeId) => ({ recipeId, recipeName: `Recept ${recipeId}` }))
	});
}

let dir: string;

beforeEach(async () => {
	dir = await mkdtemp(path.join(os.tmpdir(), 'harvest-test-'));
});

describe('harvest', () => {
	it('collects all pages, skips existing docs, records failures, writes docs and images', async () => {
		// 102 already harvested; 103 has no 2-portion variant.
		await writeFile(path.join(dir, '102.json'), '{}');
		const broken: RawRecipeAndSteps = { ...recipeWithId(103), instructions: { portions: [] } };
		const fetchImpl = fakeFetch({
			[`${BASE}/receptbank/kalorisnal`]: listing(1, 2, [101, 102]),
			[`${BASE}/receptbank/kalorisnal/2`]: listing(2, 2, [103]),
			[`${BASE}/recept/101/recept`]: recipeHtml(101, recipeWithId(101)),
			[`${BASE}/recept/103/recept`]: recipeHtml(103, broken),
			[IMG_SMALL]: new Uint8Array([1, 2, 3]),
			[IMG_LARGE]: new Uint8Array([4, 5, 6])
		});

		const summary = await harvest(dir, { fetchImpl, delayMs: 0 });

		expect(summary.totalListed).toBe(3);
		expect(summary.harvested).toBe(1);
		expect(summary.skipped).toBe(1);
		expect(summary.failed).toEqual([
			{ recipeId: 103, reason: expect.stringMatching(/no 2-portion/) }
		]);

		const doc = JSON.parse(await readFile(path.join(dir, '101.json'), 'utf8')) as RecipeDoc;
		expect(doc.recipeId).toBe(101);
		expect(doc.servings).toBe(2);
		expect(doc.images).toEqual({ large: 'images/101-large.jpg', small: 'images/101-small.jpg' });
		expect(existsSync(path.join(dir, 'images/101-large.jpg'))).toBe(true);
		expect(existsSync(path.join(dir, '103.json'))).toBe(false);
	});

	it('keeps the recipe when image downloads fail', async () => {
		const fetchImpl = fakeFetch({
			[`${BASE}/receptbank/kalorisnal`]: listing(1, 1, [101]),
			[`${BASE}/recept/101/recept`]: recipeHtml(101, recipeWithId(101))
			// image URLs deliberately unrouted -> 404
		});
		const summary = await harvest(dir, { fetchImpl, delayMs: 0 });
		expect(summary.harvested).toBe(1);
		const doc = JSON.parse(await readFile(path.join(dir, '101.json'), 'utf8')) as RecipeDoc;
		expect(doc.images).toEqual({ large: null, small: null });
	});

	it('honors --limit', async () => {
		const fetchImpl = fakeFetch({
			[`${BASE}/receptbank/kalorisnal`]: listing(1, 1, [101, 103]),
			[`${BASE}/recept/101/recept`]: recipeHtml(101, recipeWithId(101)),
			[IMG_SMALL]: new Uint8Array([1]),
			[IMG_LARGE]: new Uint8Array([2])
		});
		const summary = await harvest(dir, { fetchImpl, delayMs: 0, limit: 1 });
		expect(summary.harvested).toBe(1);
		expect(summary.failed).toEqual([]);
		expect(existsSync(path.join(dir, '103.json'))).toBe(false);
	});
});

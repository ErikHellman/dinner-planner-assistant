# Recipe Database (Linas matkasse) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local file-based database of all ~200 "Kalorisnål" recipes from linasmatkasse.se (normalized to 2 servings, with photos), plus a CLI, native Pi agent tools, and a skill doc.

**Architecture:** A new library `src/lib/server/recipes/` (mirroring `src/lib/server/willys/`) with scrape → normalize → harvest → query layers. The harvester writes one JSON doc per recipe to `data/recipes/` (committed to git) and downloads hero images. A thin CLI and three native Pi tools share the same `RecipeStore` query class.

**Tech Stack:** TypeScript, Node 24.9.0, Vitest, tsx, typebox + `@earendil-works/pi-coding-agent` (already installed — no new dependencies).

**Spec:** `docs/superpowers/specs/2026-07-18-recipe-database-design.md` — read its "Verified site contract" section before Task 2.

---

## Context for the engineer

- **Node:** always prefix commands with `PATH="$HOME/.nvm/versions/node/v24.9.0/bin:$PATH"` (the default Node is too old).
- **Test runner:** `npm test` runs all Vitest unit tests once. A single file: `npx vitest run src/lib/server/recipes/normalize.test.ts`.
- **Style:** Prettier with tabs (run `npm run format` before committing); `npm run lint` must pass.
- **Existing patterns to match:** `src/lib/server/willys/` for library/CLI layout, `src/lib/server/agent/tools/willys.ts` for Pi tools.
- **The site:** all pages embed JSON in `<script id="__NEXT_DATA__" type="application/json" nonce="">…</script>`. Listing pages: `https://www.linasmatkasse.se/receptbank/kalorisnal` (page 1) and `…/kalorisnal/{page}` (2…totalPages), 20 recipes/page under `props.pageProps.recipes`. Detail pages: `https://www.linasmatkasse.se/recept/{recipeId}/{anySlug}` with the full recipe under `props.pageProps.initialState.api.queries["recipeAndSteps({\"recipeId\":N})"].data.recipeAndSteps`. No login. Portion sizes are **strings** ("2", "4", …) and array order varies.

### Task 0: Branch

- [ ] **Step 1:** `git checkout -b recipe-database` (from `main`). No commit.

---

### Task 1: Types, fixtures, chores

**Files:**

- Create: `src/lib/server/recipes/types.ts`
- Create: `src/lib/server/recipes/fixtures/listing-page.json`
- Create: `src/lib/server/recipes/fixtures/recipe-and-steps.json`
- Create: `src/lib/server/recipes/fixtures/helpers.ts`
- Modify: `package.json` (two scripts)
- Modify: `.prettierignore` (ignore generated data)

No behavior in this task (types + test fixtures only), so no TDD cycle; later tasks' tests exercise everything here.

- [ ] **Step 1: Write `src/lib/server/recipes/types.ts`**

```ts
// ---------- Our normalized document ----------

export interface RecipeIngredient {
	/** Ingredient group heading from the recipe, e.g. "Dillsås"; null when ungrouped. */
	section: string | null;
	name: string;
	/** Parsed numeric amount for 2 servings; null when missing/unparseable ("efter smak"). */
	amount: number | null;
	/** Unit exactly as published (g, st, tsk, msk, krm, ml, påse, förp, …); null when absent. */
	unit: string | null;
	/** Human-readable original, e.g. "150 g gräddfil" — kept verbatim for future aggregation. */
	raw: string;
	/** Pantry staple (salt, oil, …) the user is assumed to have at home. */
	isBasis: boolean;
}

export interface RecipeInstruction {
	step: number;
	section: string | null;
	text: string;
}

export interface RecipeNutrition {
	energyKcal: number;
	protein: number | null;
	carbs: number | null;
	fat: number | null;
}

export interface RecipeDoc {
	recipeId: number;
	/** Stable across weekly re-issues of the same dish; dedupe key for the future. */
	mainRecipeId: number | null;
	name: string;
	headline: string | null;
	subheadline: string | null;
	description: string | null;
	chefTip: string | null;
	/** e.g. "Fisk", "Kött", "Vegetariskt" */
	mainIngredient: string | null;
	/** Always 2 — every document stores the native 2-portion variant. */
	servings: 2;
	cookingTime: { min: number | null; max: number | null };
	categories: string[];
	allergies: string[];
	nutritionPerServing: RecipeNutrition | null;
	co2eKgPerServing: number | null;
	rating: { average: number | null; count: number | null };
	ingredients: RecipeIngredient[];
	instructions: RecipeInstruction[];
	/** Paths relative to data/recipes/, e.g. "images/125524-large.jpg". */
	images: { large: string | null; small: string | null };
	source: { url: string; harvestedAt: string };
}

export interface RecipeSearchHit {
	recipeId: number;
	name: string;
	mainIngredient: string | null;
	categories: string[];
	cookingTime: { min: number | null; max: number | null };
	energyKcalPerServing: number | null;
	rating: { average: number | null; count: number | null };
}

export interface RecipeIngredientList {
	recipeId: number;
	name: string;
	servings: number;
	ingredients: RecipeIngredient[];
}

// ---------- Raw payloads from linasmatkasse.se (subset we consume) ----------

export interface RawImageUrls {
	urls?: { size?: string | null; url?: string | null }[] | null;
}

export interface RawTaxonomy {
	name?: string | null;
	type?: string | null;
}

export interface RawIngredient {
	name?: string | null;
	amount?: string | number | null;
	ingredientAmountType?: string | null;
	isBasis?: boolean | null;
}

export interface RawIngredientSection {
	sectionTitle?: string | null;
	ingredients?: RawIngredient[] | null;
}

export interface RawStep {
	order?: number | null;
	step?: string | null;
}

export interface RawStepSection {
	sectionTitle?: string | null;
	steps?: RawStep[] | null;
}

export interface RawAllergy {
	name?: string | null;
	showAllergy?: boolean | null;
}

export interface RawPortion {
	size?: string | number | null;
	allergies?: RawAllergy[] | null;
	stepSections?: RawStepSection[] | null;
	ingredientSections?: RawIngredientSection[] | null;
	nutritionFacts?: {
		recipeNutritionPerPortion?: {
			carbs?: number | null;
			energyKcal?: number | null;
			fat?: number | null;
			protein?: number | null;
		} | null;
	} | null;
	co2eKgPerPortion?: number | string | null;
}

export interface RawRecipeAndSteps {
	recipeId?: number;
	mainRecipeId?: number | null;
	recipeName?: string | null;
	recipeNameHeadline?: string | null;
	recipeNameSubheadline?: string | null;
	recipeDescription?: string | null;
	chefTip?: string | null;
	mainIngredient?: string | null;
	cookingTimeMin?: string | number | null;
	cookingTimeMax?: string | number | null;
	averageRating?: number | null;
	numberOfRatings?: number | null;
	images?: RawImageUrls | null;
	taxonomies?: RawTaxonomy[] | null;
	instructions?: { portions?: RawPortion[] | null } | null;
}

export interface RawListingRecipe {
	recipeId?: number;
	recipeName?: string | null;
	cookingTimeMin?: string | null;
	cookingTimeMax?: string | null;
	images?: RawImageUrls | null;
}

export interface RawListingPage {
	page?: number;
	totalPages?: number;
	recipes?: RawListingRecipe[] | null;
}
```

- [ ] **Step 2: Write `src/lib/server/recipes/fixtures/listing-page.json`** (shape of `props.pageProps` on a listing page)

```json
{
	"page": 1,
	"totalPages": 2,
	"recipes": [
		{
			"recipeId": 125524,
			"recipeName": "Varmrökt lax med äppelsallad och dillsås",
			"cookingTimeMin": "15",
			"cookingTimeMax": "20",
			"images": {
				"urls": [
					{ "size": "small", "url": "https://pimimages.azureedge.net/images/resized/aaa.jpg" },
					{ "size": "large", "url": "https://pimimages.azureedge.net/images/largeResized/aaa.jpg" }
				]
			}
		},
		{
			"recipeId": 36553,
			"recipeName": "Morotssoppa med kokosmjölk och nygräddat bröd",
			"cookingTimeMin": "20",
			"cookingTimeMax": "30",
			"images": { "urls": [] }
		}
	]
}
```

- [ ] **Step 3: Write `src/lib/server/recipes/fixtures/recipe-and-steps.json`** — a trimmed but realistic `recipeAndSteps` payload. Portion order is deliberately 4-before-2 (tests size-2 selection); amounts exercise every parse case; steps contain HTML entities and tags; taxonomies include types that must be dropped.

```json
{
	"language": "SE",
	"recipeId": 125524,
	"mainRecipeId": 46441,
	"recipeName": "Varmrökt lax med äppelsallad och dillsås",
	"recipeNameHeadline": "Varmrökt lax",
	"recipeNameSubheadline": "med äppelsallad och dillsås",
	"mainIngredient": "Fisk",
	"recipeDescription": null,
	"chefTip": null,
	"cookingTimeMin": "15",
	"cookingTimeMax": "20",
	"averageRating": 4.06,
	"numberOfRatings": 584,
	"images": {
		"urls": [
			{ "size": "small", "url": "https://pimimages.azureedge.net/images/resized/aaa.jpg" },
			{ "size": "large", "url": "https://pimimages.azureedge.net/images/largeResized/aaa.jpg" }
		]
	},
	"taxonomies": [
		{ "name": "Fisk och skaldjur", "type": "category_tag" },
		{ "name": "Kalorisnål", "type": "category_tag" },
		{ "name": "Kalorisnål", "type": "marketing_tag" },
		{ "name": "Utan laktos", "type": "special_food_tag" },
		{ "name": "Low calorie", "type": "onesub" },
		{ "name": "Mediterranean", "type": "recipe" },
		{ "name": "Summer", "type": "menu_planner_seasons" },
		{ "name": "ulp", "type": "menu_planning" },
		{ "name": "kyckling", "type": "recipe_chefs_internal" }
	],
	"instructions": {
		"portions": [
			{
				"size": "4",
				"allergies": [],
				"stepSections": [],
				"ingredientSections": [],
				"nutritionFacts": null,
				"co2eKgPerPortion": null
			},
			{
				"size": "2",
				"allergies": [
					{ "name": "Fisk", "showAllergy": true },
					{ "name": "Mjölk", "showAllergy": true },
					{ "name": "Gluten", "showAllergy": false }
				],
				"stepSections": [
					{
						"sectionTitle": null,
						"steps": [
							{ "order": 1, "step": "Koka potatis i l&auml;ttsaltat vatten." },
							{ "order": 2, "step": "<strong>Dills&aring;s: </strong>Blanda gr&auml;ddfil &amp; dill." }
						]
					}
				],
				"ingredientSections": [
					{
						"sectionTitle": "Dillsås",
						"ingredients": [
							{ "order": "0", "name": "gräddfil", "amount": "150", "ingredientAmountType": "g", "isBasis": false },
							{ "order": "1", "name": "salt", "amount": null, "ingredientAmountType": "krm", "isBasis": true }
						]
					},
					{
						"sectionTitle": null,
						"ingredients": [
							{ "order": "0", "name": "gurka", "amount": "½", "ingredientAmountType": "st", "isBasis": false },
							{ "order": "1", "name": "grädde", "amount": "1,5", "ingredientAmountType": "dl", "isBasis": false },
							{ "order": "2", "name": "svartpeppar", "amount": "0", "ingredientAmountType": "krm", "isBasis": true }
						]
					}
				],
				"nutritionFacts": {
					"totalWeight": 1251,
					"kcal": 1113,
					"kcalPerPortion": 556,
					"recipeNutritionPerPortion": { "carbs": 53.42, "energyKcal": 556, "fat": 24.96, "protein": 29.53 }
				},
				"co2eKgPerPortion": 1.05
			}
		]
	}
}
```

- [ ] **Step 4: Write `src/lib/server/recipes/fixtures/helpers.ts`** (test-only helpers; not picked up by Vitest because the name has no `.test.`)

```ts
/** Wrap a payload the way Next.js embeds it (note the nonce attribute — the regex must tolerate it). */
export function nextDataHtml(data: unknown): string {
	return `<html><body><main>menu</main><script id="__NEXT_DATA__" type="application/json" nonce="">${JSON.stringify(
		data
	)}</script></body></html>`;
}

export function listingHtml(pageProps: unknown): string {
	return nextDataHtml({ props: { pageProps } });
}

export function recipeHtml(recipeId: number, recipeAndSteps: unknown): string {
	return nextDataHtml({
		props: {
			pageProps: {
				initialState: {
					api: {
						queries: {
							[`recipeAndSteps({"recipeId":${recipeId}})`]: { data: { recipeAndSteps } }
						}
					}
				}
			}
		}
	});
}

/** fetch stub with exact-URL routing; unknown URLs get a 404. */
export function fakeFetch(routes: Record<string, string | Uint8Array>): typeof fetch {
	return (async (input: RequestInfo | URL) => {
		const url = String(input);
		if (!(url in routes)) return new Response('not found', { status: 404 });
		return new Response(routes[url], { status: 200 });
	}) as typeof fetch;
}
```

- [ ] **Step 5: Modify `package.json`** — add to `"scripts"` (after `"test:willys"`):

```json
		"recipes": "node --import tsx src/lib/server/recipes/cli.ts",
		"test:recipes": "RECIPES_LIVE=1 node node_modules/vitest/vitest.mjs run src/lib/server/recipes"
```

(No `--env-file` — the source is public, no credentials.)

- [ ] **Step 6: Modify `.prettierignore`** — add a line so generated data is never format-checked:

```
/data/
```

- [ ] **Step 7:** Run `npm run format`, then `npm run check` and `npm run lint` (both must pass; there are no tests yet for this code).

- [ ] **Step 8: Commit**

```bash
git add src/lib/server/recipes package.json .prettierignore
git commit -m "feat: recipe types, fixtures, and npm scripts for the Linas recipe database"
```

---

### Task 2: Scraper (`scrape.ts`)

**Files:**

- Create: `src/lib/server/recipes/scrape.ts`
- Test: `src/lib/server/recipes/scrape.test.ts`

- [ ] **Step 1: Write the failing tests** — `src/lib/server/recipes/scrape.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import listingFixture from './fixtures/listing-page.json';
import recipeFixture from './fixtures/recipe-and-steps.json';
import { fakeFetch, listingHtml, nextDataHtml, recipeHtml } from './fixtures/helpers';
import {
	extractNextData,
	fetchListingPage,
	fetchRecipeDetail,
	listingFromNextData,
	listingUrl,
	recipeFromNextData,
	recipeUrl,
	RecipeScrapeError
} from './scrape';

describe('extractNextData', () => {
	it('extracts and parses the payload despite extra script attributes', () => {
		const data = extractNextData(nextDataHtml({ props: { pageProps: { page: 1 } } }));
		expect(data).toEqual({ props: { pageProps: { page: 1 } } });
	});

	it('throws RecipeScrapeError when the marker is missing', () => {
		expect(() => extractNextData('<html><body>nope</body></html>')).toThrow(RecipeScrapeError);
	});

	it('throws RecipeScrapeError on broken JSON', () => {
		expect(() =>
			extractNextData('<script id="__NEXT_DATA__" type="application/json">{oops</script>')
		).toThrow(RecipeScrapeError);
	});
});

describe('payload navigation', () => {
	it('returns the listing pageProps', () => {
		const listing = listingFromNextData({ props: { pageProps: listingFixture } });
		expect(listing.totalPages).toBe(2);
		expect(listing.recipes).toHaveLength(2);
		expect(listing.recipes?.[0]?.recipeId).toBe(125524);
	});

	it('throws when a listing has no recipes array', () => {
		expect(() => listingFromNextData({ props: { pageProps: {} } })).toThrow(RecipeScrapeError);
	});

	it('finds recipeAndSteps regardless of the exact query key', () => {
		const data = extractNextData(recipeHtml(125524, recipeFixture));
		const recipe = recipeFromNextData(data);
		expect(recipe.recipeId).toBe(125524);
		expect(recipe.recipeName).toContain('Varmrökt lax');
	});

	it('throws when recipeAndSteps is absent', () => {
		expect(() =>
			recipeFromNextData({ props: { pageProps: { initialState: { api: { queries: {} } } } } })
		).toThrow(RecipeScrapeError);
	});
});

describe('URLs', () => {
	it('builds listing URLs (page 1 has no suffix)', () => {
		expect(listingUrl(1)).toBe('https://www.linasmatkasse.se/receptbank/kalorisnal');
		expect(listingUrl(3)).toBe('https://www.linasmatkasse.se/receptbank/kalorisnal/3');
	});

	it('builds recipe URLs with a default slug', () => {
		expect(recipeUrl(125524)).toBe('https://www.linasmatkasse.se/recept/125524/recept');
	});
});

describe('fetching', () => {
	it('fetches and parses a listing page', async () => {
		const fetchImpl = fakeFetch({
			'https://www.linasmatkasse.se/receptbank/kalorisnal': listingHtml(listingFixture)
		});
		const listing = await fetchListingPage(1, fetchImpl);
		expect(listing.recipes).toHaveLength(2);
	});

	it('fetches and parses a recipe detail page', async () => {
		const fetchImpl = fakeFetch({
			'https://www.linasmatkasse.se/recept/125524/recept': recipeHtml(125524, recipeFixture)
		});
		const recipe = await fetchRecipeDetail(125524, fetchImpl);
		expect(recipe.mainIngredient).toBe('Fisk');
	});

	it('throws RecipeScrapeError with the status on HTTP errors', async () => {
		await expect(fetchRecipeDetail(1, fakeFetch({}))).rejects.toThrow(/HTTP 404/);
	});
});
```

- [ ] **Step 2:** Run `npx vitest run src/lib/server/recipes/scrape.test.ts` — expect FAIL (module `./scrape` does not exist).

- [ ] **Step 3: Write `src/lib/server/recipes/scrape.ts`**

```ts
import type { RawListingPage, RawRecipeAndSteps } from './types';

export const BASE_URL = 'https://www.linasmatkasse.se';
const CATEGORY_PATH = '/receptbank/kalorisnal';
const USER_AGENT =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

export class RecipeScrapeError extends Error {}

/** Pull the embedded Next.js JSON out of a page. The script tag carries extra attributes (nonce). */
export function extractNextData(html: string): unknown {
	const match = html.match(/<script id="__NEXT_DATA__"[^>]*>(.*?)<\/script>/s);
	if (!match) throw new RecipeScrapeError('No __NEXT_DATA__ payload found in page');
	try {
		return JSON.parse(match[1]);
	} catch {
		throw new RecipeScrapeError('Failed to parse __NEXT_DATA__ JSON');
	}
}

type NextData = { props?: { pageProps?: Record<string, unknown> } };

export function listingFromNextData(data: unknown): RawListingPage {
	const pageProps = (data as NextData)?.props?.pageProps;
	if (!pageProps || !Array.isArray((pageProps as { recipes?: unknown }).recipes)) {
		throw new RecipeScrapeError('Listing page has no recipes in its __NEXT_DATA__');
	}
	return pageProps as RawListingPage;
}

export function recipeFromNextData(data: unknown): RawRecipeAndSteps {
	const pageProps = (data as NextData)?.props?.pageProps as
		| {
				initialState?: {
					api?: { queries?: Record<string, { data?: { recipeAndSteps?: RawRecipeAndSteps } }> };
				};
		  }
		| undefined;
	const queries = pageProps?.initialState?.api?.queries ?? {};
	const key = Object.keys(queries).find((k) => k.startsWith('recipeAndSteps('));
	const recipe = key ? queries[key]?.data?.recipeAndSteps : undefined;
	if (!recipe) throw new RecipeScrapeError('Recipe page has no recipeAndSteps in its __NEXT_DATA__');
	return recipe;
}

export function listingUrl(page: number): string {
	return page <= 1 ? `${BASE_URL}${CATEGORY_PATH}` : `${BASE_URL}${CATEGORY_PATH}/${page}`;
}

export function recipeUrl(recipeId: number, slug = 'recept'): string {
	return `${BASE_URL}/recept/${recipeId}/${slug}`;
}

export async function fetchHtml(url: string, fetchImpl: typeof fetch = fetch): Promise<string> {
	const res = await fetchImpl(url, {
		headers: { 'user-agent': USER_AGENT, accept: 'text/html' },
		redirect: 'follow'
	});
	if (!res.ok) throw new RecipeScrapeError(`GET ${url} failed: HTTP ${res.status}`);
	return res.text();
}

export async function fetchListingPage(
	page: number,
	fetchImpl: typeof fetch = fetch
): Promise<RawListingPage> {
	return listingFromNextData(extractNextData(await fetchHtml(listingUrl(page), fetchImpl)));
}

export async function fetchRecipeDetail(
	recipeId: number,
	fetchImpl: typeof fetch = fetch
): Promise<RawRecipeAndSteps> {
	return recipeFromNextData(extractNextData(await fetchHtml(recipeUrl(recipeId), fetchImpl)));
}

export async function fetchImage(
	url: string,
	fetchImpl: typeof fetch = fetch
): Promise<Uint8Array> {
	const res = await fetchImpl(url, { headers: { 'user-agent': USER_AGENT } });
	if (!res.ok) throw new RecipeScrapeError(`GET ${url} failed: HTTP ${res.status}`);
	return new Uint8Array(await res.arrayBuffer());
}
```

- [ ] **Step 4:** Run `npx vitest run src/lib/server/recipes/scrape.test.ts` — expect PASS. Then `npm test` (everything else still green).

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/recipes/scrape.ts src/lib/server/recipes/scrape.test.ts
git commit -m "feat: linasmatkasse.se scraper (listing + recipe __NEXT_DATA__ extraction)"
```

---

### Task 3: Normalizer (`normalize.ts`)

**Files:**

- Create: `src/lib/server/recipes/normalize.ts`
- Test: `src/lib/server/recipes/normalize.test.ts`

- [ ] **Step 1: Write the failing tests** — `src/lib/server/recipes/normalize.test.ts`

```ts
import { describe, expect, it } from 'vitest';
import recipeFixture from './fixtures/recipe-and-steps.json';
import {
	decodeHtmlText,
	foldText,
	normalizeRecipe,
	parseAmount,
	RecipeNormalizeError,
	slugify
} from './normalize';
import type { RawRecipeAndSteps } from './types';

const fixture = recipeFixture as RawRecipeAndSteps;
const OPTS = {
	images: { large: 'images/125524-large.jpg', small: 'images/125524-small.jpg' },
	harvestedAt: '2026-07-18T12:00:00.000Z'
};

describe('foldText / slugify', () => {
	it('lowercases and strips diacritics', () => {
		expect(foldText('Kalorisnål')).toBe('kalorisnal');
		expect(foldText('VARMRÖKT')).toBe('varmrokt');
	});

	it('slugifies recipe names', () => {
		expect(slugify('Varmrökt lax med äppelsallad och dillsås')).toBe(
			'varmrokt-lax-med-appelsallad-och-dillsas'
		);
		expect(slugify('!!!')).toBe('recept');
	});
});

describe('decodeHtmlText', () => {
	it('strips tags and decodes entities', () => {
		expect(decodeHtmlText('<strong>Dills&aring;s: </strong>Blanda gr&auml;ddfil &amp; dill.')).toBe(
			'Dillsås: Blanda gräddfil & dill.'
		);
	});

	it('decodes numeric entities and collapses whitespace', () => {
		expect(decodeHtmlText('a&#229;  b&#xE4;\n c')).toBe('aå bä c');
	});
});

describe('parseAmount', () => {
	it.each([
		['150', 150],
		['1,5', 1.5],
		['½', 0.5],
		['1½', 1.5],
		['0', null],
		['null', null],
		[null, null],
		[undefined, null],
		['efter smak', null]
	])('parses %j to %j', (input, expected) => {
		expect(parseAmount(input as string | null | undefined)).toBe(expected);
	});
});

describe('normalizeRecipe', () => {
	const doc = normalizeRecipe(fixture, OPTS);

	it('selects the 2-portion variant regardless of array order', () => {
		expect(doc.servings).toBe(2);
		expect(doc.ingredients).toHaveLength(5);
	});

	it('throws a typed error when no 2-portion variant exists', () => {
		const broken: RawRecipeAndSteps = {
			...fixture,
			instructions: { portions: [{ size: '4' }] }
		};
		expect(() => normalizeRecipe(broken, OPTS)).toThrow(RecipeNormalizeError);
		expect(() => normalizeRecipe(broken, OPTS)).toThrow(/no 2-portion/);
	});

	it('keeps only category-like taxonomies, deduplicated in order', () => {
		expect(doc.categories).toEqual(['Fisk och skaldjur', 'Kalorisnål', 'Utan laktos', 'Low calorie', 'Mediterranean']);
	});

	it('keeps only visible allergies', () => {
		expect(doc.allergies).toEqual(['Fisk', 'Mjölk']);
	});

	it('normalizes ingredients with section, parsed amount, unit, raw, and isBasis', () => {
		expect(doc.ingredients[0]).toEqual({
			section: 'Dillsås',
			name: 'gräddfil',
			amount: 150,
			unit: 'g',
			raw: '150 g gräddfil',
			isBasis: false
		});
		expect(doc.ingredients[1]).toEqual({
			section: 'Dillsås',
			name: 'salt',
			amount: null,
			unit: 'krm',
			raw: 'krm salt',
			isBasis: true
		});
		expect(doc.ingredients[2]).toEqual({
			section: null,
			name: 'gurka',
			amount: 0.5,
			unit: 'st',
			raw: '½ st gurka',
			isBasis: false
		});
		expect(doc.ingredients[4].amount).toBeNull(); // "0" means "to taste"
		expect(doc.ingredients[4].raw).toBe('0 krm svartpeppar');
	});

	it('flattens, decodes, and renumbers instructions', () => {
		expect(doc.instructions).toEqual([
			{ step: 1, section: null, text: 'Koka potatis i lättsaltat vatten.' },
			{ step: 2, section: null, text: 'Dillsås: Blanda gräddfil & dill.' }
		]);
	});

	it('extracts nutrition, CO2, cooking time, and rating', () => {
		expect(doc.nutritionPerServing).toEqual({
			energyKcal: 556,
			protein: 29.53,
			carbs: 53.42,
			fat: 24.96
		});
		expect(doc.co2eKgPerServing).toBe(1.05);
		expect(doc.cookingTime).toEqual({ min: 15, max: 20 });
		expect(doc.rating).toEqual({ average: 4.06, count: 584 });
	});

	it('builds the source URL from a slugified name', () => {
		expect(doc.source).toEqual({
			url: 'https://www.linasmatkasse.se/recept/125524/varmrokt-lax-med-appelsallad-och-dillsas',
			harvestedAt: '2026-07-18T12:00:00.000Z'
		});
	});

	it('passes image paths through', () => {
		expect(doc.images).toEqual({ large: 'images/125524-large.jpg', small: 'images/125524-small.jpg' });
	});
});
```

- [ ] **Step 2:** Run `npx vitest run src/lib/server/recipes/normalize.test.ts` — expect FAIL (module missing).

- [ ] **Step 3: Write `src/lib/server/recipes/normalize.ts`**

```ts
import { recipeUrl } from './scrape';
import type {
	RawIngredient,
	RawRecipeAndSteps,
	RecipeDoc,
	RecipeIngredient,
	RecipeInstruction
} from './types';

export class RecipeNormalizeError extends Error {}

/** Lowercase and strip diacritics: "Kalorisnål" -> "kalorisnal". */
export function foldText(text: string): string {
	return text
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLowerCase();
}

export function slugify(name: string): string {
	return (
		foldText(name)
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-+|-+$/g, '') || 'recept'
	);
}

const NAMED_ENTITIES: Record<string, string> = {
	amp: '&',
	lt: '<',
	gt: '>',
	quot: '"',
	apos: "'",
	nbsp: ' ',
	auml: 'ä',
	Auml: 'Ä',
	aring: 'å',
	Aring: 'Å',
	ouml: 'ö',
	Ouml: 'Ö',
	eacute: 'é',
	Eacute: 'É',
	uuml: 'ü',
	Uuml: 'Ü'
};

/** Strip tags, decode the entities Linas actually uses, collapse whitespace. */
export function decodeHtmlText(html: string): string {
	return html
		.replace(/<[^>]*>/g, '')
		.replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
		.replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
		.replace(/&([a-zA-Z]+);/g, (match, name: string) => NAMED_ENTITIES[name] ?? match)
		.replace(/\s+/g, ' ')
		.trim();
}

const FRACTIONS: Record<string, number> = { '¼': 0.25, '½': 0.5, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3 };

/** "150" -> 150, "1,5" -> 1.5, "½"/"1½" -> 0.5/1.5; "0", "null", null, junk -> null. */
export function parseAmount(value: string | number | null | undefined): number | null {
	if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? value : null;
	if (!value) return null;
	const s = value.trim();
	if (!s || s === 'null') return null;
	const frac = s.match(/^(\d+)?\s*([¼½¾⅓⅔])$/);
	if (frac) return (frac[1] ? parseInt(frac[1], 10) : 0) + FRACTIONS[frac[2]];
	const n = Number(s.replace(',', '.'));
	return Number.isFinite(n) && n > 0 ? n : null;
}

/** Taxonomy types that are meaningful categories (rest is internal planning noise). */
const CATEGORY_TYPES = new Set(['category_tag', 'marketing_tag', 'special_food_tag', 'recipe', 'onesub']);

function toNumber(value: string | number | null | undefined): number | null {
	if (value === null || value === undefined || value === '') return null;
	const n = Number(value);
	return Number.isFinite(n) ? n : null;
}

function normalizeIngredient(raw: RawIngredient, section: string | null): RecipeIngredient {
	const name = (raw.name ?? '').trim();
	const unit = (raw.ingredientAmountType ?? '').trim() || null;
	const amountText = typeof raw.amount === 'number' ? String(raw.amount) : (raw.amount ?? '').trim();
	const rawParts = [amountText && amountText !== 'null' ? amountText : null, unit, name];
	return {
		section,
		name,
		amount: parseAmount(raw.amount),
		unit,
		raw: rawParts.filter(Boolean).join(' '),
		isBasis: raw.isBasis === true
	};
}

export function normalizeRecipe(
	raw: RawRecipeAndSteps,
	opts: { images: { large: string | null; small: string | null }; harvestedAt: string }
): RecipeDoc {
	const recipeId = raw.recipeId;
	if (typeof recipeId !== 'number') throw new RecipeNormalizeError('Recipe payload has no recipeId');

	const portions = raw.instructions?.portions ?? [];
	const portion = portions.find((p) => String(p.size) === '2');
	if (!portion) throw new RecipeNormalizeError(`Recipe ${recipeId} has no 2-portion variant`);

	const name = (raw.recipeName ?? '').trim() || `Recept ${recipeId}`;

	const categories: string[] = [];
	for (const t of raw.taxonomies ?? []) {
		if (t?.name && t.type && CATEGORY_TYPES.has(t.type) && !categories.includes(t.name)) {
			categories.push(t.name);
		}
	}

	const allergies: string[] = [];
	for (const a of portion.allergies ?? []) {
		if (a?.name && a.showAllergy !== false && !allergies.includes(a.name)) allergies.push(a.name);
	}

	const ingredients: RecipeIngredient[] = [];
	for (const s of portion.ingredientSections ?? []) {
		for (const i of s.ingredients ?? []) {
			ingredients.push(normalizeIngredient(i, s.sectionTitle?.trim() || null));
		}
	}

	const instructions: RecipeInstruction[] = [];
	for (const s of portion.stepSections ?? []) {
		const steps = [...(s.steps ?? [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
		for (const st of steps) {
			const text = decodeHtmlText(st.step ?? '');
			if (text) {
				instructions.push({
					step: instructions.length + 1,
					section: s.sectionTitle?.trim() || null,
					text
				});
			}
		}
	}

	const nut = portion.nutritionFacts?.recipeNutritionPerPortion;

	return {
		recipeId,
		mainRecipeId: raw.mainRecipeId ?? null,
		name,
		headline: raw.recipeNameHeadline ?? null,
		subheadline: raw.recipeNameSubheadline ?? null,
		description: raw.recipeDescription ?? null,
		chefTip: raw.chefTip ?? null,
		mainIngredient: raw.mainIngredient ?? null,
		servings: 2,
		cookingTime: { min: toNumber(raw.cookingTimeMin), max: toNumber(raw.cookingTimeMax) },
		categories,
		allergies,
		nutritionPerServing:
			nut && typeof nut.energyKcal === 'number'
				? {
						energyKcal: nut.energyKcal,
						protein: nut.protein ?? null,
						carbs: nut.carbs ?? null,
						fat: nut.fat ?? null
					}
				: null,
		co2eKgPerServing: toNumber(portion.co2eKgPerPortion),
		rating: { average: raw.averageRating ?? null, count: raw.numberOfRatings ?? null },
		ingredients,
		instructions,
		images: opts.images,
		source: { url: recipeUrl(recipeId, slugify(name)), harvestedAt: opts.harvestedAt }
	};
}
```

- [ ] **Step 4:** Run `npx vitest run src/lib/server/recipes/normalize.test.ts` — expect PASS. Then `npm test`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/recipes/normalize.ts src/lib/server/recipes/normalize.test.ts
git commit -m "feat: recipe normalizer (2-serving selection, entity decoding, amount parsing)"
```

---

### Task 4: Query layer (`query.ts`)

**Files:**

- Create: `src/lib/server/recipes/query.ts`
- Test: `src/lib/server/recipes/query.test.ts`

- [ ] **Step 1: Write the failing tests** — `src/lib/server/recipes/query.test.ts`

```ts
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
		{ section: null, name: 'varmrökt lax', amount: 200, unit: 'g', raw: '200 g varmrökt lax', isBasis: false }
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
		{ section: null, name: 'zucchini', amount: 1, unit: 'st', raw: '1 st zucchini', isBasis: false },
		{ section: null, name: 'svarta bönor', amount: 1, unit: 'förp', raw: '1 förp svarta bönor', isBasis: false }
	]
});

let store: RecipeStore;

beforeAll(async () => {
	const dir = await mkdtemp(path.join(os.tmpdir(), 'recipes-test-'));
	await mkdir(path.join(dir, 'images'), { recursive: true });
	await writeFile(path.join(dir, '1.json'), JSON.stringify(LAX));
	await writeFile(path.join(dir, '2.json'), JSON.stringify(BOWL));
	await writeFile(path.join(dir, 'notes.txt'), 'not a recipe');
	store = new RecipeStore(dir);
});

describe('search', () => {
	it('returns all recipes as compact hits when no filters given', async () => {
		const hits = await store.search();
		expect(hits.map((h) => h.recipeId)).toEqual([2, 1]); // sorted by name (sv)
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

describe('missing database', () => {
	it('explains how to build the database when the directory is absent', async () => {
		const empty = new RecipeStore(path.join(os.tmpdir(), 'recipes-does-not-exist'));
		await expect(empty.search()).rejects.toThrow(/harvest/);
	});
});
```

- [ ] **Step 2:** Run `npx vitest run src/lib/server/recipes/query.test.ts` — expect FAIL (module missing).

- [ ] **Step 3: Write `src/lib/server/recipes/query.ts`**

```ts
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { foldText } from './normalize';
import type { RecipeDoc, RecipeIngredientList, RecipeSearchHit } from './types';

export class RecipeQueryError extends Error {}

export interface RecipeSearchFilters {
	query?: string;
	category?: string;
	maxTimeMinutes?: number;
	maxKcal?: number;
}

export function defaultRecipesDir(): string {
	return path.resolve(process.cwd(), 'data/recipes');
}

/** Read-only queries over the harvested JSON documents in a data/recipes directory. */
export class RecipeStore {
	constructor(private readonly dir: string) {}

	async loadAll(): Promise<RecipeDoc[]> {
		let files: string[];
		try {
			files = await readdir(this.dir);
		} catch {
			throw new RecipeQueryError(
				`Recipe database not found at ${this.dir} — run "npm run recipes -- harvest" first`
			);
		}
		const docs: RecipeDoc[] = [];
		for (const file of files.filter((f) => /^\d+\.json$/.test(f))) {
			docs.push(JSON.parse(await readFile(path.join(this.dir, file), 'utf8')) as RecipeDoc);
		}
		if (docs.length === 0) {
			throw new RecipeQueryError(
				`No recipes found in ${this.dir} — run "npm run recipes -- harvest" first`
			);
		}
		return docs;
	}

	async search(filters: RecipeSearchFilters = {}): Promise<RecipeSearchHit[]> {
		const docs = await this.loadAll();
		const query = filters.query ? foldText(filters.query) : null;
		const category = filters.category ? foldText(filters.category) : null;
		return docs
			.filter((doc) => {
				if (query) {
					const inName = foldText(doc.name).includes(query);
					const inIngredients = doc.ingredients.some((i) => foldText(i.name).includes(query));
					if (!inName && !inIngredients) return false;
				}
				if (category) {
					const haystack = [...doc.categories, doc.mainIngredient ?? ''];
					if (!haystack.some((c) => foldText(c).includes(category))) return false;
				}
				// Recipes with unknown time/kcal are excluded when the corresponding filter is used.
				if (
					filters.maxTimeMinutes !== undefined &&
					(doc.cookingTime.max ?? Infinity) > filters.maxTimeMinutes
				) {
					return false;
				}
				if (
					filters.maxKcal !== undefined &&
					(doc.nutritionPerServing?.energyKcal ?? Infinity) > filters.maxKcal
				) {
					return false;
				}
				return true;
			})
			.map((doc) => ({
				recipeId: doc.recipeId,
				name: doc.name,
				mainIngredient: doc.mainIngredient,
				categories: doc.categories,
				cookingTime: doc.cookingTime,
				energyKcalPerServing: doc.nutritionPerServing?.energyKcal ?? null,
				rating: doc.rating
			}))
			.sort((a, b) => a.name.localeCompare(b.name, 'sv'));
	}

	async get(recipeId: number): Promise<RecipeDoc> {
		try {
			const file = path.join(this.dir, `${recipeId}.json`);
			return JSON.parse(await readFile(file, 'utf8')) as RecipeDoc;
		} catch {
			throw new RecipeQueryError(`Recipe ${recipeId} not found in the local database`);
		}
	}

	async ingredients(recipeIds: number[]): Promise<RecipeIngredientList[]> {
		return Promise.all(
			recipeIds.map(async (id) => {
				const doc = await this.get(id);
				return {
					recipeId: doc.recipeId,
					name: doc.name,
					servings: doc.servings,
					ingredients: doc.ingredients
				};
			})
		);
	}
}
```

- [ ] **Step 4:** Run `npx vitest run src/lib/server/recipes/query.test.ts` — expect PASS. Then `npm test`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/recipes/query.ts src/lib/server/recipes/query.test.ts
git commit -m "feat: recipe query layer (search/get/ingredients over JSON docs)"
```

---

### Task 5: Harvester (`harvest.ts`) + live test

**Files:**

- Create: `src/lib/server/recipes/harvest.ts`
- Test: `src/lib/server/recipes/harvest.test.ts`
- Create: `src/lib/server/recipes/live.test.ts`

- [ ] **Step 1: Write the failing tests** — `src/lib/server/recipes/harvest.test.ts`

```ts
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
		expect(summary.failed).toEqual([{ recipeId: 103, reason: expect.stringMatching(/no 2-portion/) }]);

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
```

- [ ] **Step 2:** Run `npx vitest run src/lib/server/recipes/harvest.test.ts` — expect FAIL (module missing).

- [ ] **Step 3: Write `src/lib/server/recipes/harvest.ts`**

```ts
import { access, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { normalizeRecipe, RecipeNormalizeError } from './normalize';
import { fetchImage, fetchListingPage, fetchRecipeDetail, RecipeScrapeError } from './scrape';
import type { RawListingPage, RawRecipeAndSteps } from './types';

export interface HarvestOptions {
	/** Re-fetch recipes and images that already exist on disk. */
	force?: boolean;
	/** Cap the number of new recipes fetched (testing/politeness). */
	limit?: number;
	concurrency?: number;
	delayMs?: number;
	log?: (message: string) => void;
	fetchImpl?: typeof fetch;
}

export interface HarvestSummary {
	totalListed: number;
	harvested: number;
	skipped: number;
	failed: { recipeId: number; reason: string }[];
}

async function exists(file: string): Promise<boolean> {
	try {
		await access(file);
		return true;
	} catch {
		return false;
	}
}

function imageUrl(raw: RawRecipeAndSteps, size: 'small' | 'large'): string | null {
	return raw.images?.urls?.find((u) => u?.size === size)?.url || null;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Scrape the kalorisnål receptbank into `dir` (idempotent; failures don't abort the run). */
export async function harvest(dir: string, options: HarvestOptions = {}): Promise<HarvestSummary> {
	const {
		force = false,
		limit,
		concurrency = 4,
		delayMs = 150,
		log = () => {},
		fetchImpl = fetch
	} = options;
	const imagesDir = path.join(dir, 'images');
	await mkdir(imagesDir, { recursive: true });

	const listed: number[] = [];
	const collect = (page: RawListingPage) => {
		for (const r of page.recipes ?? []) {
			if (typeof r.recipeId === 'number' && !listed.includes(r.recipeId)) listed.push(r.recipeId);
		}
	};
	const first = await fetchListingPage(1, fetchImpl);
	collect(first);
	const totalPages = first.totalPages ?? 1;
	for (let page = 2; page <= totalPages; page++) {
		collect(await fetchListingPage(page, fetchImpl));
		log(`Listed page ${page}/${totalPages} (${listed.length} recipes so far)`);
	}

	const summary: HarvestSummary = { totalListed: listed.length, harvested: 0, skipped: 0, failed: [] };
	const pending: number[] = [];
	for (const id of listed) {
		if (!force && (await exists(path.join(dir, `${id}.json`)))) summary.skipped++;
		else pending.push(id);
	}
	const queue = limit !== undefined ? pending.slice(0, limit) : pending;

	let index = 0;
	const worker = async () => {
		for (;;) {
			const i = index++;
			if (i >= queue.length) return;
			const recipeId = queue[i];
			try {
				await sleep(delayMs);
				const raw = await fetchRecipeDetail(recipeId, fetchImpl);
				const images: { large: string | null; small: string | null } = { large: null, small: null };
				for (const size of ['large', 'small'] as const) {
					const url = imageUrl(raw, size);
					if (!url) continue;
					try {
						const file = path.join(imagesDir, `${recipeId}-${size}.jpg`);
						if (force || !(await exists(file))) await writeFile(file, await fetchImage(url, fetchImpl));
						images[size] = `images/${recipeId}-${size}.jpg`;
					} catch (error) {
						log(`Image ${size} for ${recipeId} failed: ${error instanceof Error ? error.message : error}`);
					}
				}
				const doc = normalizeRecipe(raw, { images, harvestedAt: new Date().toISOString() });
				await writeFile(path.join(dir, `${recipeId}.json`), JSON.stringify(doc, null, 2) + '\n');
				summary.harvested++;
				log(`Harvested ${recipeId}: ${doc.name} (${summary.harvested}/${queue.length})`);
			} catch (error) {
				const reason =
					error instanceof RecipeScrapeError || error instanceof RecipeNormalizeError
						? error.message
						: `Unexpected error: ${error instanceof Error ? error.message : String(error)}`;
				summary.failed.push({ recipeId, reason });
				log(`Failed ${recipeId}: ${reason}`);
			}
		}
	};
	await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, queue.length)) }, worker));
	return summary;
}
```

- [ ] **Step 4:** Run `npx vitest run src/lib/server/recipes/harvest.test.ts` — expect PASS.

- [ ] **Step 5: Write `src/lib/server/recipes/live.test.ts`** (skipped unless `RECIPES_LIVE=1`; runs via `npm run test:recipes`)

```ts
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
```

- [ ] **Step 6:** Run `npm test` (live tests must be skipped, everything green). Then run the live contract once: `PATH="$HOME/.nvm/versions/node/v24.9.0/bin:$PATH" npm run test:recipes` — expect the 2 live tests to PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/server/recipes/harvest.ts src/lib/server/recipes/harvest.test.ts src/lib/server/recipes/live.test.ts
git commit -m "feat: recipe harvester (idempotent scrape of the kalorisnål receptbank)"
```

---

### Task 6: CLI (`cli.ts`)

**Files:**

- Create: `src/lib/server/recipes/cli.ts`

The CLI is a thin shell over tested modules (same policy as the Willys CLI — no unit tests; smoke-tested below).

- [ ] **Step 1: Write `src/lib/server/recipes/cli.ts`**

```ts
#!/usr/bin/env node
import { harvest } from './harvest';
import { defaultRecipesDir, RecipeStore, type RecipeSearchFilters } from './query';

function log(msg: string): void {
	process.stderr.write(msg + '\n');
}
function out(data: unknown): void {
	process.stdout.write(JSON.stringify(data, null, 2) + '\n');
}

function usage(): number {
	log(
		[
			'Usage:',
			'  recipes harvest [--force] [--limit N]',
			'  recipes search [--query q] [--category c] [--max-time minutes] [--max-kcal kcal]',
			'  recipes get <recipeId>',
			'  recipes ingredients <recipeId...>'
		].join('\n')
	);
	return 64;
}

/** --force -> true; --name value -> "value". Returns null on malformed input. */
function parseFlags(args: string[]): Map<string, string | true> | null {
	const flags = new Map<string, string | true>();
	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		if (!arg.startsWith('--')) return null;
		const name = arg.slice(2);
		if (name === 'force') {
			flags.set(name, true);
			continue;
		}
		const value = args[++i];
		if (value === undefined) return null;
		flags.set(name, value);
	}
	return flags;
}

async function main(argv: string[]): Promise<number> {
	const [command, ...rest] = argv;
	const dir = defaultRecipesDir();
	const store = new RecipeStore(dir);

	try {
		if (command === 'harvest') {
			const flags = parseFlags(rest);
			if (!flags) return usage();
			let limit: number | undefined;
			if (flags.has('limit')) {
				limit = Number(flags.get('limit'));
				if (!Number.isInteger(limit) || limit < 1) {
					log('--limit must be a positive integer');
					return 64;
				}
			}
			log('Harvesting kalorisnål recipes from linasmatkasse.se…');
			const summary = await harvest(dir, { force: flags.get('force') === true, limit, log });
			out(summary);
			return 0;
		}
		if (command === 'search') {
			const flags = parseFlags(rest);
			if (!flags) return usage();
			const filters: RecipeSearchFilters = {};
			if (flags.has('query')) filters.query = String(flags.get('query'));
			if (flags.has('category')) filters.category = String(flags.get('category'));
			for (const [flag, key] of [
				['max-time', 'maxTimeMinutes'],
				['max-kcal', 'maxKcal']
			] as const) {
				if (!flags.has(flag)) continue;
				const value = Number(flags.get(flag));
				if (!Number.isFinite(value) || value <= 0) {
					log(`--${flag} must be a positive number`);
					return 64;
				}
				filters[key] = value;
			}
			out(await store.search(filters));
			return 0;
		}
		if (command === 'get' && rest[0]) {
			const recipeId = Number(rest[0]);
			if (!Number.isInteger(recipeId)) {
				log('recipeId must be an integer');
				return 64;
			}
			out(await store.get(recipeId));
			return 0;
		}
		if (command === 'ingredients' && rest.length > 0) {
			const recipeIds = rest.map(Number);
			if (recipeIds.some((n) => !Number.isInteger(n))) {
				log('recipeIds must be integers');
				return 64;
			}
			out(await store.ingredients(recipeIds));
			return 0;
		}
		return usage();
	} catch (error) {
		log(`Error: ${error instanceof Error ? error.message : String(error)}`);
		return 1;
	}
}

main(process.argv.slice(2))
	.then((code) => process.exit(code))
	.catch((error) => {
		process.stderr.write(`Fatal: ${error instanceof Error ? error.message : String(error)}\n`);
		process.exit(1);
	});
```

- [ ] **Step 2: Smoke-test against the live site** (Node 24.9.0 PATH prefix; run from the repo root):

```bash
npm run --silent recipes -- harvest --limit 2   # expect summary JSON: harvested: 2 (or skipped if re-run)
npm run --silent recipes -- search --max-kcal 600 | head -30   # expect compact hits JSON
npm run --silent recipes -- get <someRecipeIdFromSearch> | head -40   # expect a full doc, servings: 2
npm run --silent recipes -- ingredients <sameId>   # expect ingredient list JSON
npm run --silent recipes -- nonsense; echo "exit=$?"   # expect usage on stderr, exit=64
```

The two harvested docs/images land in `data/recipes/` — leave them there (they're part of the final database) but do NOT `git add` them in this task.

- [ ] **Step 3:** `npm run format`, `npm run check`, `npm run lint`, `npm test` — all green.

- [ ] **Step 4: Commit**

```bash
git add src/lib/server/recipes/cli.ts
git commit -m "feat: recipes CLI (harvest/search/get/ingredients)"
```

---

### Task 7: Pi agent tools + wiring

**Files:**

- Create: `src/lib/server/agent/tools/recipes.ts`
- Modify: `src/lib/server/agent/session.ts`
- Modify: `src/lib/server/agent/prompt.ts`

Follows `src/lib/server/agent/tools/willys.ts` exactly (self-contained ok/fail/guarded helpers — deliberately not shared with the Willys file to avoid touching reviewed code). No unit tests, same as the Willys tools; verified e2e in Task 9.

- [ ] **Step 1: Write `src/lib/server/agent/tools/recipes.ts`**

```ts
import { defineTool, type ToolDefinition } from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';
import { RecipeQueryError, RecipeStore } from '../../recipes/query';

function ok(data: unknown): { content: { type: 'text'; text: string }[]; details: unknown } {
	return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }], details: data };
}

function fail(err: unknown): { content: { type: 'text'; text: string }[]; details: unknown } {
	const message =
		err instanceof RecipeQueryError
			? err.message
			: `Recipe tool error: ${err instanceof Error ? err.message : String(err)}`;
	return { content: [{ type: 'text', text: message }], details: { error: message } };
}

async function guarded(run: () => Promise<unknown>) {
	try {
		return ok(await run());
	} catch (err) {
		return fail(err);
	}
}

/** Native Pi tools over the local Linas matkasse recipe database. Read-only: no harvest tool. */
export function createRecipeTools(store: RecipeStore): ToolDefinition[] {
	return [
		defineTool({
			name: 'recipe_search',
			label: 'Recipe search',
			description:
				'Search the local recipe database (~200 kalorisnål dinner recipes from Linas matkasse, each stored for exactly 2 servings). All filters are optional and AND-combined. Returns compact hits: recipeId, name, categories, cooking time, kcal per serving, rating.',
			promptSnippet: 'recipe_search(query?, category?, maxTimeMinutes?, maxKcal?): find dinner recipes',
			parameters: Type.Object({
				query: Type.Optional(
					Type.String({ description: 'Matches recipe name or ingredient names, e.g. "lax" or "kyckling"' })
				),
				category: Type.Optional(
					Type.String({
						description:
							'Matches categories or main ingredient, e.g. "vegetariskt", "fisk", "Mediterranean", "kalorisnål"'
					})
				),
				maxTimeMinutes: Type.Optional(Type.Number({ description: 'Max cooking time in minutes' })),
				maxKcal: Type.Optional(Type.Number({ description: 'Max energy per serving in kcal' }))
			}),
			execute: (_id, params) => guarded(() => store.search(params))
		}),
		defineTool({
			name: 'recipe_get',
			label: 'Recipe details',
			description:
				'Get one full recipe by recipeId: ingredients for 2 servings, step-by-step instructions, nutrition, allergies, categories.',
			promptSnippet: 'recipe_get(recipeId): full recipe',
			parameters: Type.Object({
				recipeId: Type.Number({ description: 'Numeric recipeId from recipe_search' })
			}),
			execute: (_id, params) => guarded(() => store.get(params.recipeId))
		}),
		defineTool({
			name: 'recipe_ingredients',
			label: 'Recipe ingredients',
			description:
				'Ingredient lists (2 servings per recipe) for one or more recipes — use when collecting groceries to buy. Ingredients with isBasis=true are pantry staples the user likely has.',
			promptSnippet: 'recipe_ingredients(recipeIds): ingredients per recipe',
			parameters: Type.Object({
				recipeIds: Type.Array(Type.Number(), {
					description: 'recipeIds from recipe_search',
					minItems: 1
				})
			}),
			execute: (_id, params) => guarded(() => store.ingredients(params.recipeIds))
		})
	];
}
```

- [ ] **Step 2: Modify `src/lib/server/agent/session.ts`** — three edits:

After `import { createWillysTools } from './tools/willys';` add:

```ts
import { RecipeStore } from '../recipes/query';
import { createRecipeTools } from './tools/recipes';
```

After the `const willys = new WillysClient(…);` block add:

```ts
	const recipes = new RecipeStore(path.resolve(process.cwd(), 'data/recipes'));
```

Change the `customTools` line in `createAgentSession({ … })` from:

```ts
		customTools: createWillysTools(willys),
```

to:

```ts
		customTools: [...createWillysTools(willys), ...createRecipeTools(recipes)],
```

Also update the comment above `DefaultResourceLoader` from "Grocery tools (Willys search + cart) are registered below via customTools;" to "Grocery tools (Willys search + cart) and recipe-database tools are registered below via customTools;".

- [ ] **Step 3: Modify `src/lib/server/agent/prompt.ts`** — replace the final sentence of the Willys paragraph, `The recipe database and saved food preferences are still\ncoming later.`, with nothing (delete it), and insert a new paragraph after that Willys paragraph (before "Keep answers concise"):

```
You also have a local database of ~200 "kalorisnål" (calorie-smart) dinner recipes
from Linas matkasse, each stored for exactly 2 servings:
- recipe_search — find recipes by text (name/ingredients), category (e.g. vegetariskt,
  fisk, Mediterranean), max cooking time in minutes, or max kcal per serving
- recipe_get — one full recipe: ingredients for 2 servings, instructions, nutrition, allergies
- recipe_ingredients — just the ingredient lists for chosen recipes, for building a shopping list

Prefer these recipes when planning dinners. Amounts are for 2 servings — scale when the
user needs more. Ingredients flagged isBasis are pantry staples (salt, oil, …) the user
likely has at home. Saved food preferences are still coming later.
```

- [ ] **Step 4:** `npm run format`, `npm run check`, `npm run lint`, `npm test` — all green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/agent/tools/recipes.ts src/lib/server/agent/session.ts src/lib/server/agent/prompt.ts
git commit -m "feat: recipe_search/recipe_get/recipe_ingredients Pi tools wired into the agent"
```

---

### Task 8: Skill doc + CLAUDE.md

**Files:**

- Create: `.agents/skills/recipes/SKILL.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Write `.agents/skills/recipes/SKILL.md`**

````md
---
name: recipes
description: Search and read the local Linas matkasse recipe database (kalorisnål category, every recipe normalized to 2 servings) via npm scripts
---

# Recipe database

A local, file-based database of ~200 "Kalorisnål" (calorie-smart) dinner recipes
scraped from linasmatkasse.se into `data/recipes/` (one JSON document per recipe,
hero photos under `data/recipes/images/`). Every document stores ingredients for
**exactly 2 servings** plus instructions, categories, allergies, nutrition per
serving, and CO2 footprint.

## Commands

All output is pretty-printed JSON on stdout; status goes to stderr. Use
`npm run --silent recipes -- …` when piping (npm prints a banner line otherwise).

```bash
# Search: all filters optional, AND-combined, case- and diacritic-insensitive
npm run --silent recipes -- search --query lax
npm run --silent recipes -- search --category vegetariskt --max-time 30 --max-kcal 600

# Full recipe by id (ids come from search hits)
npm run --silent recipes -- get 125524

# Ingredient lists for one or more recipes (for building a shopping list)
npm run --silent recipes -- ingredients 125524 36553

# Refresh the database from linasmatkasse.se (idempotent; --force refetches)
npm run recipes -- harvest
```

## Output shapes

`search` returns compact hits:
`{recipeId, name, mainIngredient, categories, cookingTime: {min, max},
energyKcalPerServing, rating}` — pass `recipeId` to `get`/`ingredients`.

`get` returns the full document: `name`, `servings` (always 2), `cookingTime`
(minutes), `categories`, `allergies`, `nutritionPerServing` (kcal + macros),
`ingredients` (`{section, name, amount, unit, raw, isBasis}` — `isBasis` marks
pantry staples like salt and oil; `amount: null` means "to taste"), and
`instructions` (`{step, text}`).

`ingredients` returns `{recipeId, name, servings, ingredients}` per recipe.

## Notes

- Amounts are for 2 servings — scale for other serving counts.
- `search --query` matches recipe names AND ingredient names; `--category`
  matches categories and the main ingredient (Swedish and some English terms,
  e.g. "vegetariskt", "fisk", "Mediterranean", "Low calorie").
- Exit codes: 0 ok, 1 runtime error, 64 usage error.
````

- [ ] **Step 2: Modify `CLAUDE.md`:**

In the **Architecture** section, after the `src/lib/server/willys/` bullet, add:

```md
- `src/lib/server/recipes/` — Linas matkasse recipe database. `harvest.ts`
  scrapes the public "Kalorisnål" receptbank (Next.js `__NEXT_DATA__` payloads,
  no login) into `data/recipes/` (one JSON doc per recipe, 2 servings each,
  hero images under `images/`; committed to git). `query.ts` (`RecipeStore`)
  serves search/get/ingredients to both the CLI (`cli.ts`) and the agent tools.
- `src/lib/server/agent/tools/recipes.ts` — read-only native Pi tools
  (`recipe_search`, `recipe_get`, `recipe_ingredients`). Harvesting is CLI-only,
  deliberately not an agent tool.
```

In the **Commands** section, after the `npm run willys` line, add:

```md
- `npm run recipes -- <harvest|search|get|ingredients …>` — recipe database CLI
  (use `npm run --silent recipes -- …` when piping JSON). `npm run test:recipes`
  runs the live site-contract tests (network).
```

In **Future milestones**, remove "Recipe database + query tools and" from the first sentence (that part is now built; ingredient aggregation is still future) and mention that the recipe DB covers the kalorisnål category only so far. Also add a line to the `data/` description in Architecture: `data/recipes/` holds the harvested recipe database (tracked in git, unlike the other `data/` subdirs).

The skill dir `.agents/skills/` is listed in Architecture as a placeholder — update that mention to note it now contains the `recipes` skill.

- [ ] **Step 3:** `npm run format`, `npm run lint` — green.

- [ ] **Step 4: Commit**

```bash
git add .agents/skills/recipes/SKILL.md CLAUDE.md
git commit -m "docs: recipes skill (npm-script usage) and CLAUDE.md updates"
```

---

### Task 9: Full harvest + final verification (controller task — not a subagent)

- [ ] **Step 1:** Full live harvest: `npm run recipes -- harvest` (expect `totalListed` ≈ 200, `harvested` ≈ totalListed minus the smoke-test docs, `failed` empty or tiny; investigate any failure reasons).
- [ ] **Step 2:** Spot checks: `search --category vegetariskt`, `search --query kyckling --max-kcal 550`, `get` + `ingredients` on a hit; verify images exist and open one.
- [ ] **Step 3:** `npm run check`, `npm run lint`, `npm test` — all green.
- [ ] **Step 4:** E2E through the web app: start the dev server, ask the chat agent for e.g. "två kalorisnåla fiskmiddagar under 600 kcal" and confirm it uses `recipe_search`/`recipe_get` and answers from the local DB.
- [ ] **Step 5:** `git rm data/recipes/.gitkeep`; `git add data/recipes docs/superpowers/plans/2026-07-18-recipe-database.md`; commit `"feat: harvest kalorisnål recipe database (~200 recipes + images)"`.
- [ ] **Step 6:** Merge to main per superpowers:finishing-a-development-branch (user pre-approved: merge locally, delete branch).

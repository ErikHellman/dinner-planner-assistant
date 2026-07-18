# Ingredient Aggregation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deterministic aggregation of ingredients from selected recipes into one shopping list (items + pantry staples), exposed as a CLI subcommand, a native Pi tool, and an agent skill.

**Architecture:** A pure aggregator (`aggregate.ts`) over the existing `RecipeStore.ingredients()` output groups ingredients by folded name, sums volume units in ml and other units per-unit, scales by `servings / 2`, and splits pantry staples from groceries. Thin wrappers add persistence (`data/plans/shopping-list.json`, atomic write shared with the harvester), a `recipes aggregate` CLI subcommand, and a `recipe_aggregate` Pi tool. Spec: `docs/superpowers/specs/2026-07-18-ingredient-aggregation-design.md`.

**Tech Stack:** TypeScript (SvelteKit server lib), Vitest, typebox + `@earendil-works/pi-coding-agent` `defineTool`, Node 24.9.0 (`PATH="$HOME/.nvm/versions/node/v24.9.0/bin:$PATH"` prefix on every command).

**Branch:** `ingredient-aggregation` off `main`.

**Repo conventions that apply to every task:** Prettier uses tabs; run `npm run lint` before committing. Error classes set `this.name` and pass `ErrorOptions` through. Stale IDE diagnostics are common — trust fresh `npm run check` output only. All test commands: `PATH="$HOME/.nvm/versions/node/v24.9.0/bin:$PATH" npx vitest run <file>` from the repo root.

---

### Task 1: Shared atomic write module

Extract `writeFileAtomic` from `harvest.ts` into its own module so the aggregator can reuse it. Behavior is already covered by harvest tests; add one direct test for the new module boundary.

**Files:**
- Create: `src/lib/server/recipes/atomic-write.ts`
- Create: `src/lib/server/recipes/atomic-write.test.ts`
- Modify: `src/lib/server/recipes/harvest.ts` (remove the local function, import instead)

- [ ] **Step 1: Write the failing test**

Create `src/lib/server/recipes/atomic-write.test.ts`:

```typescript
import { mkdtemp, readdir, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { writeFileAtomic } from './atomic-write';

describe('writeFileAtomic', () => {
	it('writes the content and leaves no .tmp file behind', async () => {
		const dir = await mkdtemp(path.join(os.tmpdir(), 'atomic-write-test-'));
		const file = path.join(dir, 'out.json');

		await writeFileAtomic(file, '{"ok":true}\n');

		expect(await readFile(file, 'utf8')).toBe('{"ok":true}\n');
		expect(await readdir(dir)).toEqual(['out.json']);
	});

	it('propagates write errors and cleans up the tmp file', async () => {
		const dir = await mkdtemp(path.join(os.tmpdir(), 'atomic-write-test-'));
		// Writing to a path whose parent is a *file* fails.
		const blocker = path.join(dir, 'blocker');
		await writeFileAtomic(blocker, 'x');
		const file = path.join(blocker, 'nested.json');

		await expect(writeFileAtomic(file, 'x')).rejects.toThrow();
		expect(await readdir(dir)).toEqual(['blocker']);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `PATH="$HOME/.nvm/versions/node/v24.9.0/bin:$PATH" npx vitest run src/lib/server/recipes/atomic-write.test.ts`
Expected: FAIL — cannot resolve `./atomic-write`.

- [ ] **Step 3: Create the module**

Create `src/lib/server/recipes/atomic-write.ts`:

```typescript
import { rename, unlink, writeFile } from 'node:fs/promises';

/**
 * Write via tmp+rename so an interrupted run never leaves a truncated file (a partial
 * doc would poison the query layer's loadAll AND satisfy harvest's skip-if-exists
 * check). The tmp lives in the same directory (rename is POSIX-atomic only within a
 * filesystem) and a `.tmp` suffix never matches the query layer's /^\d+\.json$/ filter.
 */
export async function writeFileAtomic(file: string, data: Uint8Array | string): Promise<void> {
	const tmp = `${file}.tmp`;
	try {
		await writeFile(tmp, data);
		await rename(tmp, file);
	} catch (error) {
		await unlink(tmp).catch(() => {});
		throw error;
	}
}
```

- [ ] **Step 4: Point harvest.ts at the shared module**

In `src/lib/server/recipes/harvest.ts`:

Replace the first import line

```typescript
import { access, mkdir, rename, unlink, writeFile } from 'node:fs/promises';
```

with

```typescript
import { access, mkdir } from 'node:fs/promises';
import { writeFileAtomic } from './atomic-write';
```

and delete the whole local `writeFileAtomic` function including its doc comment (lines starting at `/**\n * Write via tmp+rename …` through the closing `}` of the function). Everything else in `harvest.ts` is unchanged.

- [ ] **Step 5: Run the recipes test suite**

Run: `PATH="$HOME/.nvm/versions/node/v24.9.0/bin:$PATH" npx vitest run src/lib/server/recipes`
Expected: PASS — atomic-write tests plus all existing scrape/normalize/query/harvest tests (live tests stay skipped without `RECIPES_LIVE=1`).

- [ ] **Step 6: Check types and lint, then commit**

Run: `PATH="$HOME/.nvm/versions/node/v24.9.0/bin:$PATH" npm run check && PATH="$HOME/.nvm/versions/node/v24.9.0/bin:$PATH" npm run lint`
Expected: 0 errors.

```bash
git add src/lib/server/recipes/atomic-write.ts src/lib/server/recipes/atomic-write.test.ts src/lib/server/recipes/harvest.ts
git commit -m "refactor: extract writeFileAtomic into shared atomic-write module"
```

---

### Task 2: Pure aggregator (`aggregateIngredients`)

The core algorithm. Pure function, no I/O. Full semantics in the spec's "Aggregation semantics" section — the tests below encode them.

**Files:**
- Create: `src/lib/server/recipes/aggregate.ts`
- Create: `src/lib/server/recipes/aggregate.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/server/recipes/aggregate.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';
import { aggregateIngredients, RecipeAggregateError } from './aggregate';
import type { RecipeIngredient, RecipeIngredientList } from './types';

function ing(
	name: string,
	amount: number | null,
	unit: string | null,
	isBasis = false
): RecipeIngredient {
	return { section: null, name, amount, unit, raw: `${amount ?? ''} ${unit ?? ''} ${name}`.trim(), isBasis };
}

function list(
	recipeId: number,
	name: string,
	ingredients: RecipeIngredient[]
): RecipeIngredientList {
	return { recipeId, name, servings: 2, ingredients };
}

describe('aggregateIngredients', () => {
	it('merges the same ingredient across recipes case/diacritic-insensitively, keeping the first-seen spelling', () => {
		const { items } = aggregateIngredients(
			[
				list(1, 'A', [ing('Gräddfil', 150, 'g')]),
				list(2, 'B', [ing('gräddfil', 100, 'g')])
			],
			2
		);
		expect(items).toEqual([
			{
				name: 'Gräddfil',
				amounts: [{ value: 250, unit: 'g', display: '250 g' }],
				toTaste: false,
				recipeIds: [1, 2]
			}
		]);
	});

	it('sums volume units (krm/tsk/msk/dl) into one ml bucket', () => {
		const { items } = aggregateIngredients(
			[
				list(1, 'A', [ing('olja', 2, 'tsk'), ing('olja', 5, 'krm')]),
				list(2, 'B', [ing('olja', 1, 'msk')])
			],
			2
		);
		// 10 + 5 + 15 = 30 ml -> 2 msk
		expect(items[0].amounts).toEqual([{ value: 30, unit: 'ml', display: '2 msk' }]);
	});

	it('renders volume in the largest unit giving a multiple of 0.25', () => {
		const render = (amount: number, unit: string) =>
			aggregateIngredients([list(1, 'A', [ing('x', amount, unit)])], 2).items[0].amounts[0]
				.display;
		expect(render(0.5, 'dl')).toBe('0.5 dl'); // 50 ml
		expect(render(3, 'msk')).toBe('3 msk'); // 45 ml: 0.45 dl fails, 3 msk wins
		expect(render(7, 'krm')).toBe('7 krm'); // 7 ml: no dl/msk/tsk multiple
		expect(render(0.1, 'krm')).toBe('0.1 ml'); // nothing fits -> ml fallback
	});

	it('keeps incompatible units as separate amounts under one ingredient, sorted by unit', () => {
		const { items } = aggregateIngredients(
			[
				list(1, 'A', [ing('äggnudlar', 200, 'g')]),
				list(2, 'B', [ing('äggnudlar', 0.5, 'förp'), ing('äggnudlar', 100, 'g')])
			],
			2
		);
		expect(items[0].amounts).toEqual([
			{ value: 0.5, unit: 'förp', display: '0.5 förp' },
			{ value: 300, unit: 'g', display: '300 g' }
		]);
	});

	it('puts all-basis ingredients in pantryStaples and mixed basis/non-basis in items', () => {
		const { items, pantryStaples } = aggregateIngredients(
			[
				list(1, 'A', [ing('salt', 1, 'tsk', true), ing('ägg', 2, 'st', true)]),
				list(2, 'B', [ing('salt', 2, 'krm', true), ing('ägg', 1, 'st', false)])
			],
			2
		);
		expect(pantryStaples.map((i) => i.name)).toEqual(['salt']);
		expect(items.map((i) => i.name)).toEqual(['ägg']);
		expect(items[0].amounts).toEqual([{ value: 3, unit: 'st', display: '3 st' }]);
	});

	it('sets toTaste for null amounts without dropping numeric ones', () => {
		const { pantryStaples } = aggregateIngredients(
			[
				list(1, 'A', [ing('salt', 1, 'tsk', true), ing('peppar', null, null, true)]),
				list(2, 'B', [ing('salt', null, null, true)])
			],
			2
		);
		const salt = pantryStaples.find((i) => i.name === 'salt');
		const peppar = pantryStaples.find((i) => i.name === 'peppar');
		expect(salt).toMatchObject({
			toTaste: true,
			amounts: [{ value: 5, unit: 'ml', display: '1 tsk' }]
		});
		expect(peppar).toMatchObject({ toTaste: true, amounts: [] });
	});

	it('scales amounts by servings/2, including odd servings', () => {
		const lists = [list(1, 'A', [ing('lök', 1, 'st'), ing('mjöl', 100, 'g')])];
		const four = aggregateIngredients(lists, 4).items;
		expect(four.map((i) => i.amounts[0])).toEqual([
			{ value: 2, unit: 'st', display: '2 st' },
			{ value: 200, unit: 'g', display: '200 g' }
		]);
		const three = aggregateIngredients(lists, 3).items;
		expect(three.map((i) => i.amounts[0])).toEqual([
			{ value: 1.5, unit: 'st', display: '1.5 st' },
			{ value: 150, unit: 'g', display: '150 g' }
		]);
	});

	it('rejects non-integer or < 1 servings', () => {
		for (const bad of [0, -2, 1.5, NaN]) {
			expect(() => aggregateIngredients([], bad)).toThrow(RecipeAggregateError);
		}
	});

	it('counts duplicate recipes double but lists the recipeId once', () => {
		const twice = [
			list(7, 'A', [ing('ris', 150, 'g')]),
			list(7, 'A', [ing('ris', 150, 'g')])
		];
		const { items } = aggregateIngredients(twice, 2);
		expect(items[0].amounts[0].value).toBe(300);
		expect(items[0].recipeIds).toEqual([7]);
	});

	it('sorts items with Swedish collation', () => {
		const { items } = aggregateIngredients(
			[list(1, 'A', [ing('Örter', 1, 'st'), ing('Citron', 1, 'st'), ing('Ägg', 1, 'st')])],
			2
		);
		expect(items.map((i) => i.name)).toEqual(['Citron', 'Ägg', 'Örter']);
	});

	it('rounds sums to 2 decimals', () => {
		const { items } = aggregateIngredients(
			[list(1, 'A', [ing('fetaost', 1.1, 'g'), ing('fetaost', 2.2, 'g')])],
			2
		);
		expect(items[0].amounts[0].value).toBe(3.3);
	});

	it('handles a null unit as its own bucket with a bare-number display', () => {
		const { items } = aggregateIngredients([list(1, 'A', [ing('ägg', 2, null)])], 2);
		expect(items[0].amounts).toEqual([{ value: 2, unit: null, display: '2' }]);
	});
});
```

(In the scaling test, items sort sv: "lök" < "mjöl", so lök comes first in both assertions.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `PATH="$HOME/.nvm/versions/node/v24.9.0/bin:$PATH" npx vitest run src/lib/server/recipes/aggregate.test.ts`
Expected: FAIL — cannot resolve `./aggregate`.

- [ ] **Step 3: Implement the aggregator**

Create `src/lib/server/recipes/aggregate.ts`:

```typescript
import { foldText } from './normalize';
import type { RecipeIngredientList } from './types';

export class RecipeAggregateError extends Error {
	constructor(message: string, options?: ErrorOptions) {
		super(message, options);
		this.name = 'RecipeAggregateError';
	}
}

export interface AggregatedAmount {
	/** Canonical machine value, e.g. 45 (ml) or 300 (g). */
	value: number;
	/** Canonical unit: "ml" for the merged volume bucket, otherwise the source unit. */
	unit: string | null;
	/** Human-readable rendering, e.g. "3 msk", "300 g", "2 st". */
	display: string;
}

export interface ShoppingListItem {
	name: string;
	amounts: AggregatedAmount[];
	/** True when at least one source line had no numeric amount ("efter smak"). */
	toTaste: boolean;
	/** Which selected recipes need this ingredient (unique, ascending). */
	recipeIds: number[];
}

export interface ShoppingList {
	servings: number;
	/** One entry per input recipeId, in input order (duplicates repeated). */
	recipes: { recipeId: number; name: string }[];
	items: ShoppingListItem[];
	pantryStaples: ShoppingListItem[];
	generatedAt: string;
}

/** ml per unit for the volume family that merges into a single bucket. */
const ML_PER_UNIT = new Map<string, number>([
	['krm', 1],
	['tsk', 5],
	['msk', 15],
	['dl', 100],
	// Defensive aliases — absent from the current database but free to accept.
	['ml', 1],
	['l', 1000]
]);

/** Largest-first display candidates; the first giving a multiple of 0.25 wins. */
const VOLUME_DISPLAY: readonly { unit: string; ml: number }[] = [
	{ unit: 'dl', ml: 100 },
	{ unit: 'msk', ml: 15 },
	{ unit: 'tsk', ml: 5 },
	{ unit: 'krm', ml: 1 }
];

const round2 = (v: number): number => Math.round(v * 100) / 100;

const isQuarterMultiple = (v: number): boolean => Math.abs(v * 4 - Math.round(v * 4)) < 1e-9;

function displayVolume(ml: number): string {
	for (const candidate of VOLUME_DISPLAY) {
		const value = round2(ml / candidate.ml);
		// value > 0 guard: tiny totals would otherwise round to 0 and falsely "fit"
		// the largest unit (0.1 ml must not render as "0 dl").
		if (value > 0 && isQuarterMultiple(value)) return `${value} ${candidate.unit}`;
	}
	return `${ml} ml`;
}

interface Group {
	name: string;
	volumeMl: number | null;
	/** folded unit -> bucket keeping the original unit spelling */
	units: Map<string, { unit: string | null; total: number }>;
	toTaste: boolean;
	allBasis: boolean;
	recipeIds: Set<number>;
}

/**
 * Aggregate ingredient lists (as returned by RecipeStore.ingredients, 2 servings each)
 * into shopping-list items scaled to `servings`. Deterministic; volume units merge in ml,
 * every other unit sums only with itself. Groups where every occurrence is a pantry
 * staple (isBasis) end up in pantryStaples, everything else in items.
 */
export function aggregateIngredients(
	lists: RecipeIngredientList[],
	servings: number
): { items: ShoppingListItem[]; pantryStaples: ShoppingListItem[] } {
	if (!Number.isInteger(servings) || servings < 1) {
		throw new RecipeAggregateError(`servings must be a positive integer, got ${servings}`);
	}
	const scale = servings / 2;

	const groups = new Map<string, Group>();
	for (const recipe of lists) {
		for (const ingredient of recipe.ingredients) {
			const key = foldText(ingredient.name);
			let group = groups.get(key);
			if (!group) {
				group = {
					name: ingredient.name,
					volumeMl: null,
					units: new Map(),
					toTaste: false,
					allBasis: true,
					recipeIds: new Set()
				};
				groups.set(key, group);
			}
			group.recipeIds.add(recipe.recipeId);
			if (!ingredient.isBasis) group.allBasis = false;
			if (ingredient.amount === null) {
				group.toTaste = true;
				continue;
			}
			const scaled = ingredient.amount * scale;
			const foldedUnit = ingredient.unit === null ? null : foldText(ingredient.unit);
			const mlPerUnit = foldedUnit === null ? undefined : ML_PER_UNIT.get(foldedUnit);
			if (mlPerUnit !== undefined) {
				group.volumeMl = (group.volumeMl ?? 0) + scaled * mlPerUnit;
			} else {
				const bucket = group.units.get(foldedUnit ?? '');
				if (bucket) bucket.total += scaled;
				else group.units.set(foldedUnit ?? '', { unit: ingredient.unit, total: scaled });
			}
		}
	}

	const items: ShoppingListItem[] = [];
	const pantryStaples: ShoppingListItem[] = [];
	for (const group of groups.values()) {
		const amounts: AggregatedAmount[] = [];
		if (group.volumeMl !== null) {
			const ml = round2(group.volumeMl);
			amounts.push({ value: ml, unit: 'ml', display: displayVolume(ml) });
		}
		for (const bucket of group.units.values()) {
			const value = round2(bucket.total);
			amounts.push({
				value,
				unit: bucket.unit,
				display: bucket.unit === null ? `${value}` : `${value} ${bucket.unit}`
			});
		}
		amounts.sort((a, b) => {
			if (a.unit === null) return b.unit === null ? 0 : 1;
			if (b.unit === null) return -1;
			return a.unit.localeCompare(b.unit, 'sv');
		});
		const item: ShoppingListItem = {
			name: group.name,
			amounts,
			toTaste: group.toTaste,
			recipeIds: [...group.recipeIds].sort((a, b) => a - b)
		};
		(group.allBasis ? pantryStaples : items).push(item);
	}
	const byName = (a: ShoppingListItem, b: ShoppingListItem) => a.name.localeCompare(b.name, 'sv');
	items.sort(byName);
	pantryStaples.sort(byName);
	return { items, pantryStaples };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `PATH="$HOME/.nvm/versions/node/v24.9.0/bin:$PATH" npx vitest run src/lib/server/recipes/aggregate.test.ts`
Expected: PASS (12 tests).

- [ ] **Step 5: Check, lint, commit**

Run: `PATH="$HOME/.nvm/versions/node/v24.9.0/bin:$PATH" npm run check && PATH="$HOME/.nvm/versions/node/v24.9.0/bin:$PATH" npm run lint`
Expected: clean.

```bash
git add src/lib/server/recipes/aggregate.ts src/lib/server/recipes/aggregate.test.ts
git commit -m "feat: pure ingredient aggregator with volume merging and pantry split"
```

---

### Task 3: `buildShoppingList` + `saveShoppingList`

I/O wrappers: load from the store, stamp metadata, persist atomically.

**Files:**
- Modify: `src/lib/server/recipes/aggregate.ts` (append functions)
- Modify: `src/lib/server/recipes/aggregate.test.ts` (append describe blocks)

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/server/recipes/aggregate.test.ts`. Extend the imports at the top of the file:

```typescript
import { mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
	aggregateIngredients,
	buildShoppingList,
	RecipeAggregateError,
	saveShoppingList,
	type ShoppingList
} from './aggregate';
import { RecipeQueryError, RecipeStore } from './query';
import type { RecipeDoc, RecipeIngredient, RecipeIngredientList } from './types';
```

Append these blocks at the end of the file:

```typescript
function doc(recipeId: number, name: string, ingredients: RecipeIngredient[]): RecipeDoc {
	return {
		recipeId,
		mainRecipeId: null,
		name,
		headline: null,
		subheadline: null,
		description: null,
		chefTip: null,
		mainIngredient: null,
		servings: 2,
		cookingTime: { min: null, max: null },
		categories: [],
		allergies: [],
		nutritionPerServing: null,
		co2eKgPerServing: null,
		rating: { average: null, count: null },
		ingredients,
		instructions: [],
		images: { large: null, small: null },
		source: { url: 'https://example.test', harvestedAt: '2026-07-18T00:00:00.000Z' }
	};
}

async function storeWith(...docs: RecipeDoc[]): Promise<RecipeStore> {
	const dir = await mkdtemp(path.join(os.tmpdir(), 'aggregate-store-test-'));
	for (const d of docs) {
		await writeFile(path.join(dir, `${d.recipeId}.json`), JSON.stringify(d));
	}
	return new RecipeStore(dir);
}

describe('buildShoppingList', () => {
	it('loads recipes, aggregates, and stamps metadata (input order, duplicates repeated)', async () => {
		const store = await storeWith(
			doc(1, 'Laxpanna', [ing('gul lök', 150, 'g')]),
			doc(2, 'Kycklinggryta', [ing('gul lök', 150, 'g')])
		);
		const listResult = await buildShoppingList(store, [2, 1, 2], 4);
		expect(listResult.servings).toBe(4);
		expect(listResult.recipes).toEqual([
			{ recipeId: 2, name: 'Kycklinggryta' },
			{ recipeId: 1, name: 'Laxpanna' },
			{ recipeId: 2, name: 'Kycklinggryta' }
		]);
		// 150 + 150 + 150 (recipe 2 twice) scaled x2 = 900
		expect(listResult.items[0].amounts[0]).toEqual({ value: 900, unit: 'g', display: '900 g' });
		expect(Number.isNaN(Date.parse(listResult.generatedAt))).toBe(false);
	});

	it('propagates store errors for unknown recipeIds', async () => {
		const store = await storeWith(doc(1, 'Laxpanna', [ing('gul lök', 150, 'g')]));
		await expect(buildShoppingList(store, [1, 999], 2)).rejects.toThrow(RecipeQueryError);
	});
});

describe('saveShoppingList', () => {
	const emptyList: ShoppingList = {
		servings: 2,
		recipes: [],
		items: [],
		pantryStaples: [],
		generatedAt: '2026-07-18T00:00:00.000Z'
	};

	it('creates parent directories, writes pretty JSON + newline, returns the path', async () => {
		const dir = await mkdtemp(path.join(os.tmpdir(), 'aggregate-save-test-'));
		const target = path.join(dir, 'plans', 'shopping-list.json');

		const written = await saveShoppingList(emptyList, target);

		expect(written).toBe(target);
		const content = await readFile(target, 'utf8');
		expect(content.endsWith('\n')).toBe(true);
		expect(JSON.parse(content)).toEqual(emptyList);
		expect(await readdir(path.join(dir, 'plans'))).toEqual(['shopping-list.json']);
	});
});
```

- [ ] **Step 2: Run tests to verify the new ones fail**

Run: `PATH="$HOME/.nvm/versions/node/v24.9.0/bin:$PATH" npx vitest run src/lib/server/recipes/aggregate.test.ts`
Expected: FAIL — `buildShoppingList` / `saveShoppingList` not exported.

- [ ] **Step 3: Implement**

In `src/lib/server/recipes/aggregate.ts`, extend the top imports:

```typescript
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { writeFileAtomic } from './atomic-write';
import { foldText } from './normalize';
import type { RecipeStore } from './query';
import type { RecipeIngredientList } from './types';
```

Append at the end of the file:

```typescript
/**
 * Load the selected recipes and aggregate them into a shopping list. Unknown ids fail
 * the whole call (RecipeQueryError from the store) — a hard failure naming the bad id
 * beats a silently incomplete shopping list.
 */
export async function buildShoppingList(
	store: RecipeStore,
	recipeIds: number[],
	servings: number
): Promise<ShoppingList> {
	const lists = await store.ingredients(recipeIds);
	const { items, pantryStaples } = aggregateIngredients(lists, servings);
	return {
		servings,
		recipes: lists.map((l) => ({ recipeId: l.recipeId, name: l.name })),
		items,
		pantryStaples,
		generatedAt: new Date().toISOString()
	};
}

export function defaultShoppingListPath(): string {
	return path.resolve(process.cwd(), 'data/plans/shopping-list.json');
}

/** Persist the latest shopping list (atomic write) for the future web UI. */
export async function saveShoppingList(
	list: ShoppingList,
	filePath: string = defaultShoppingListPath()
): Promise<string> {
	await mkdir(path.dirname(filePath), { recursive: true });
	await writeFileAtomic(filePath, JSON.stringify(list, null, 2) + '\n');
	return filePath;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `PATH="$HOME/.nvm/versions/node/v24.9.0/bin:$PATH" npx vitest run src/lib/server/recipes/aggregate.test.ts`
Expected: PASS (15 tests).

- [ ] **Step 5: Check, lint, commit**

Run: `PATH="$HOME/.nvm/versions/node/v24.9.0/bin:$PATH" npm run check && PATH="$HOME/.nvm/versions/node/v24.9.0/bin:$PATH" npm run lint`
Expected: clean.

```bash
git add src/lib/server/recipes/aggregate.ts src/lib/server/recipes/aggregate.test.ts
git commit -m "feat: buildShoppingList + atomic saveShoppingList persistence"
```

---

### Task 4: CLI `aggregate` subcommand + gitignore

No unit-test harness exists for the CLI (established repo pattern) — verify by running it.

**Files:**
- Modify: `src/lib/server/recipes/cli.ts`
- Modify: `.gitignore`

- [ ] **Step 1: Add the subcommand**

In `src/lib/server/recipes/cli.ts`:

Add to the imports:

```typescript
import { buildShoppingList, saveShoppingList } from './aggregate';
```

Add the usage line after the `'  recipes ingredients <recipeId...>'` line:

```typescript
				'  recipes aggregate <recipeId...> [--servings N]'
```

Add the command branch after the `ingredients` branch (before the final `return usage();`):

```typescript
			if (command === 'aggregate' && rest.length > 0) {
				const flagStart = rest.findIndex((a) => a.startsWith('--'));
				const idArgs = flagStart === -1 ? rest : rest.slice(0, flagStart);
				const flags = parseFlags(
					flagStart === -1 ? [] : rest.slice(flagStart),
					new Set(['servings'])
				);
				if (!flags || idArgs.length === 0) return usage();
				const recipeIds = idArgs.map(Number);
				if (recipeIds.some((n) => !Number.isInteger(n))) {
					log('recipeIds must be integers');
					return 64;
				}
				let servings = 2;
				if (flags.has('servings')) {
					servings = Number(flags.get('servings'));
					if (!Number.isInteger(servings) || servings < 1) {
						log('--servings must be a positive integer');
						return 64;
					}
				}
				const shoppingList = await buildShoppingList(store, recipeIds, servings);
				const saved = await saveShoppingList(shoppingList);
				log(`Saved shopping list to ${saved}`);
				out(shoppingList);
				return 0;
			}
```

- [ ] **Step 2: Git-ignore the plans directory**

In `.gitignore`, after the `# Willys session cache (contains auth cookies)` block, add:

```
# Latest aggregated shopping list (written by "recipes aggregate" / recipe_aggregate)
/data/plans/
```

- [ ] **Step 3: Verify by running the CLI against the real database**

```bash
cd /path/to/repo  # repo root
PATH="$HOME/.nvm/versions/node/v24.9.0/bin:$PATH" npm run --silent recipes -- aggregate; echo "exit=$?"
```
Expected: usage lines on stderr including the new `aggregate` line; `exit=64`.

```bash
PATH="$HOME/.nvm/versions/node/v24.9.0/bin:$PATH" npm run --silent recipes -- aggregate 36553 --servings four; echo "exit=$?"
```
Expected: `--servings must be a positive integer`; `exit=64`.

```bash
PATH="$HOME/.nvm/versions/node/v24.9.0/bin:$PATH" npm run --silent recipes -- aggregate 36553 125524 --servings 4 > /tmp/agg.json; echo "exit=$?"; head -c 400 /tmp/agg.json
```
Expected: stderr `Saved shopping list to …/data/plans/shopping-list.json`; `exit=0`; stdout JSON starts with `{ "servings": 4, "recipes": [ { "recipeId": 36553 …`.

```bash
PATH="$HOME/.nvm/versions/node/v24.9.0/bin:$PATH" npm run --silent recipes -- aggregate 999999; echo "exit=$?"
```
Expected: `Error: Recipe 999999 not found in the local database`; `exit=1`.

```bash
git check-ignore data/plans/shopping-list.json && echo IGNORED
```
Expected: `IGNORED`.

- [ ] **Step 4: Check, lint, commit**

Run: `PATH="$HOME/.nvm/versions/node/v24.9.0/bin:$PATH" npm run check && PATH="$HOME/.nvm/versions/node/v24.9.0/bin:$PATH" npm run lint`
Expected: clean.

```bash
git add src/lib/server/recipes/cli.ts .gitignore
git commit -m "feat: recipes aggregate CLI subcommand writing data/plans/shopping-list.json"
```

---

### Task 5: `recipe_aggregate` Pi tool

**Files:**
- Modify: `src/lib/server/agent/tools/recipes.ts`
- Modify: `src/lib/server/agent/tools/recipes.test.ts`

- [ ] **Step 1: Write the failing tests**

In `src/lib/server/agent/tools/recipes.test.ts`:

Update the imports and constants at the top:

```typescript
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { createRecipeTools } from './recipes';
import { RecipeStore } from '../../recipes/query';
import type { RecipeDoc } from '../../recipes/types';

const EXPECTED_NAMES = ['recipe_search', 'recipe_get', 'recipe_ingredients', 'recipe_aggregate'];
```

Give the `LAX` fixture ingredients (replace `ingredients: [],` in the existing fixture):

```typescript
	ingredients: [
		{ section: null, name: 'Gul lök', amount: 150, unit: 'g', raw: '150 g gul lök', isBasis: false },
		{ section: null, name: 'salt', amount: null, unit: null, raw: 'salt', isBasis: true }
	],
```

Add a second fixture doc after `LAX`:

```typescript
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
```

In `beforeAll`, write the second doc too and keep the temp dir for output paths:

```typescript
let store: RecipeStore;
let tmpDir: string;

beforeAll(async () => {
	tmpDir = await mkdtemp(path.join(os.tmpdir(), 'recipe-tools-test-'));
	await writeFile(path.join(tmpDir, '1.json'), JSON.stringify(LAX));
	await writeFile(path.join(tmpDir, '2.json'), JSON.stringify(KYCKLING));
	store = new RecipeStore(tmpDir);
});
```

Update the count test:

```typescript
	it('returns four tools with the exact expected names', () => {
		const tools = createRecipeTools(stubStore());
		expect(tools).toHaveLength(4);
		expect(tools.map((t) => t.name)).toEqual(EXPECTED_NAMES);
	});
```

Append inside the `describe` block:

```typescript
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
```

Note: `recipe_get` tests reference doc 1 and 999 — unchanged and still valid (LAX gained ingredients; its `recipe_get` assertion `toEqual(LAX)` still holds because the fixture object itself is what's written to disk).

- [ ] **Step 2: Run tests to verify they fail**

Run: `PATH="$HOME/.nvm/versions/node/v24.9.0/bin:$PATH" npx vitest run src/lib/server/agent/tools/recipes.test.ts`
Expected: FAIL — length 3 ≠ 4, no `recipe_aggregate`, `createRecipeTools` takes 1 argument.

- [ ] **Step 3: Implement the tool**

In `src/lib/server/agent/tools/recipes.ts`:

Update imports:

```typescript
import { defineTool, type ToolDefinition } from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';
import {
	buildShoppingList,
	RecipeAggregateError,
	saveShoppingList
} from '../../recipes/aggregate';
import { RecipeQueryError, RecipeStore } from '../../recipes/query';
```

Extend `fail()` so aggregate errors pass through verbatim:

```typescript
function fail(err: unknown): { content: { type: 'text'; text: string }[]; details: unknown } {
	const message =
		err instanceof RecipeQueryError || err instanceof RecipeAggregateError
			? err.message
			: `Recipe tool error: ${err instanceof Error ? err.message : String(err)}`;
	return { content: [{ type: 'text', text: message }], details: { error: message } };
}
```

Change the factory signature (the JSDoc line stays, amended):

```typescript
/** Native Pi tools over the local Linas matkasse recipe database. Read-only except for
 * recipe_aggregate persisting the latest shopping list; no harvest tool. */
export function createRecipeTools(
	store: RecipeStore,
	options: { shoppingListPath?: string } = {}
): ToolDefinition[] {
```

Append the new tool as the fourth entry of the returned array (after `recipe_ingredients`):

```typescript
		defineTool({
			name: 'recipe_aggregate',
			label: 'Shopping list',
			description:
				'Aggregate the chosen recipes into ONE shopping list scaled to the requested servings (recipes are stored for 2; duplicates count double). Same-name ingredients merge; volume units (krm/tsk/msk/dl) sum together in ml with a human-readable display, other units sum per unit. Returns items (groceries to buy) and pantryStaples (assumed at home — skip when filling the cart unless asked). Also saves the list to data/plans/shopping-list.json.',
			promptSnippet: 'recipe_aggregate(recipeIds, servings?): build the shopping list',
			parameters: Type.Object({
				recipeIds: Type.Array(Type.Integer({ minimum: 1 }), {
					description: 'recipeIds of the chosen recipes, from recipe_search',
					minItems: 1
				}),
				servings: Type.Optional(
					Type.Integer({ minimum: 1, description: 'Servings per recipe (default 2)' })
				)
			}),
			execute: (_id, params) =>
				guarded(async () => {
					const list = await buildShoppingList(store, params.recipeIds, params.servings ?? 2);
					await saveShoppingList(list, options.shoppingListPath);
					return list;
				})
		})
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `PATH="$HOME/.nvm/versions/node/v24.9.0/bin:$PATH" npx vitest run src/lib/server/agent/tools/recipes.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Check, lint, commit**

Run: `PATH="$HOME/.nvm/versions/node/v24.9.0/bin:$PATH" npm run check && PATH="$HOME/.nvm/versions/node/v24.9.0/bin:$PATH" npm run lint`
Expected: clean. (`session.ts` calls `createRecipeTools(recipes)` — still valid with the defaulted options parameter; no change there.)

```bash
git add src/lib/server/agent/tools/recipes.ts src/lib/server/agent/tools/recipes.test.ts
git commit -m "feat: recipe_aggregate Pi tool building the shopping list"
```

---

### Task 6: System prompt, skills, docs

**Files:**
- Modify: `src/lib/server/agent/prompt.ts`
- Create: `.agents/skills/shopping-list/SKILL.md`
- Modify: `.agents/skills/recipes/SKILL.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update the system prompt**

In `src/lib/server/agent/prompt.ts`, replace this block:

```
- recipe_ingredients — just the ingredient lists for chosen recipes, for building a shopping list

Prefer these recipes when planning dinners. Amounts are for 2 servings — scale when the
user needs more. Ingredients flagged isBasis are pantry staples (salt, oil, …) the user
likely has at home. Saved food preferences are still coming later.
```

with:

```
- recipe_ingredients — just the ingredient lists for chosen recipes, per recipe
- recipe_aggregate — merge the chosen recipes' ingredients into ONE shopping list scaled
  to the requested servings; returns items to buy and pantryStaples assumed at home

Prefer these recipes when planning dinners. Amounts are for 2 servings — scale when the
user needs more. Ingredients flagged isBasis are pantry staples (salt, oil, …) the user
likely has at home. Saved food preferences are still coming later.

When the user has settled on recipes and servings, call recipe_aggregate with the chosen
recipeIds, then fill the Willys cart from its items: willys_search each ingredient and
willys_cart_add a matching product with enough quantity. Skip pantryStaples unless the
user asks to include them.
```

- [ ] **Step 2: Create the shopping-list skill**

Create `.agents/skills/shopping-list/SKILL.md`:

````markdown
---
name: shopping-list
description: Aggregate ingredients from selected recipes into one shopping list and populate the Willys grocery cart via CLI
---

# Shopping list

Turn chosen recipes from the local recipe database into one aggregated shopping
list, then fill the Willys online grocery cart from it. Aggregation is fully
deterministic — same-name ingredients merge, volume units (krm/tsk/msk/dl) sum
together, and amounts scale to the requested servings.

## Workflow

```bash
# 1. Find and pick recipes (see the recipes skill for all filters)
npm run --silent recipes -- search --query lax --max-kcal 600

# 2. Aggregate the chosen recipeIds into a shopping list (default 2 servings)
npm run --silent recipes -- aggregate 36553 125524 --servings 4

# 3. For each entry in "items": find a matching product and add it to the cart
npm run --silent willys -- search "gul lök"
npm run --silent willys -- cart add 101233933_ST 1
```

Step 2 prints the shopping list JSON on stdout and also saves it to
`data/plans/shopping-list.json` (overwritten on every run).

## Output shape

```json
{
	"servings": 4,
	"recipes": [{ "recipeId": 36553, "name": "…" }],
	"items": [
		{
			"name": "gul lök",
			"amounts": [{ "value": 300, "unit": "g", "display": "300 g" }],
			"toTaste": false,
			"recipeIds": [36553, 125524]
		}
	],
	"pantryStaples": [ /* same shape */ ],
	"generatedAt": "…"
}
```

- `items` — groceries to buy. `pantryStaples` — aggregated the same way, but
  the user is assumed to have them at home; skip them unless asked.
- `amounts` — one entry per unit family. Merged volumes use `unit: "ml"` with a
  kitchen-friendly `display` ("2 msk"); other units (g, st, förp, …) keep their
  own entry. Incompatible units are never guessed into each other.
- `toTaste: true` — at least one recipe uses the ingredient "efter smak"
  (no amount).
- Duplicate recipeIds are allowed and count double (same dish twice that week).

## Shopping tips

- Search Willys with the plain ingredient name (`display` is a cooking measure,
  not a package size); pick a package that covers the required amount.
- Weight-priced products (product codes ending `_KG`) cannot be added via the
  CLI — pick a piece-priced (`_ST`) alternative.
- Checkout is intentionally not possible; only cart management.

## Exit codes (recipes CLI)

`0` ok · `1` runtime error (e.g. unknown recipeId — the whole aggregation
fails rather than producing an incomplete list) · `64` usage error.

## Related

- `recipes` skill — searching the database, full recipe details.
- `docs/willys-cli.md` — full Willys CLI reference (login, cart semantics).
````

- [ ] **Step 3: Update the recipes skill**

In `.agents/skills/recipes/SKILL.md`:

In the `## Commands` code block, after the `ingredients` example, add:

```bash
# Aggregate chosen recipes into one shopping list (see the shopping-list skill)
npm run --silent recipes -- aggregate 125524 36553 --servings 4
```

At the end of `## Output shapes`, add:

```
`aggregate` returns `{servings, recipes, items, pantryStaples, generatedAt}` —
see the shopping-list skill for the full shape and the Willys cart workflow.
```

- [ ] **Step 4: Update CLAUDE.md**

In `CLAUDE.md`:

1. Commands section — extend the recipes bullet's command list example: after
   `npm run recipes -- <harvest|search|get|ingredients …>` change the angle-bracket list to
   `<harvest|search|get|ingredients|aggregate …>`.
2. Architecture section — in the `src/lib/server/recipes/` bullet, after the
   sentence about `query.ts`, add: `` `aggregate.ts` builds the deterministic
   shopping list (volume units merge in ml, pantry staples split out, amounts
   scaled from the stored 2 servings) and persists the latest one to
   `data/plans/shopping-list.json` (git-ignored). ``
3. Architecture section — in the `src/lib/server/agent/tools/recipes.ts` bullet,
   change the tool list to `(recipe_search, recipe_get, recipe_ingredients,
   recipe_aggregate)` and drop the word "read-only" (aggregate writes the plan
   file), e.g. "native Pi tools (…). Harvesting is CLI-only, deliberately not an
   agent tool."
4. Data section (the `data/sessions/` bullet in Architecture) — add:
   `` `data/plans/` (git-ignored) holds the latest aggregated shopping list. ``
   And note the new skill: `.agents/skills/` now contains `recipes` and
   `shopping-list`.
5. Future milestones — replace the first sentence ("Ingredient aggregation is
   still to come.") with: "Ingredient aggregation is done (`recipes aggregate`
   CLI + `recipe_aggregate` tool + the `shopping-list` skill). Still to come:
   food-preference documents and a web UI for the weekly plan/shopping list."

- [ ] **Step 5: Verify docs build nothing broken, commit**

Run: `PATH="$HOME/.nvm/versions/node/v24.9.0/bin:$PATH" npm run check && PATH="$HOME/.nvm/versions/node/v24.9.0/bin:$PATH" npm run lint && PATH="$HOME/.nvm/versions/node/v24.9.0/bin:$PATH" npm test`
Expected: all clean/green (prompt.ts change is a string constant; lint covers formatting of the edited files).

```bash
git add src/lib/server/agent/prompt.ts .agents/skills/shopping-list/SKILL.md .agents/skills/recipes/SKILL.md CLAUDE.md
git commit -m "docs: shopping-list skill, prompt and docs for ingredient aggregation"
```

---

### Task 7: Full verification on the real database

No new code — the milestone's verification gate (run by the controller, not a subagent, if executing via subagent-driven development).

- [ ] **Step 1: Full suite**

Run: `PATH="$HOME/.nvm/versions/node/v24.9.0/bin:$PATH" npm run check && PATH="$HOME/.nvm/versions/node/v24.9.0/bin:$PATH" npm run lint && PATH="$HOME/.nvm/versions/node/v24.9.0/bin:$PATH" npm test`
Expected: 0 type errors, lint clean, all tests pass (live tests skipped).

- [ ] **Step 2: CLI against the real DB with hand-verified sums**

```bash
PATH="$HOME/.nvm/versions/node/v24.9.0/bin:$PATH" npm run --silent recipes -- aggregate 36553 125524 --servings 4 > /tmp/agg-real.json
```

Then pick one overlapping and one volume-family ingredient from
`data/recipes/36553.json` and `data/recipes/125524.json`, compute the expected
scaled totals by hand (amounts × 2 for servings 4), and confirm the values in
`/tmp/agg-real.json` match. Confirm every ingredient of both docs appears in
exactly one of `items`/`pantryStaples` (pantry only when isBasis everywhere).

- [ ] **Step 3: Confirm persistence + ignore**

```bash
cat data/plans/shopping-list.json | head -3
git status --short   # data/plans must NOT appear
```

- [ ] **Step 4: Web-chat e2e**

Start the dev server (`.claude/launch.json` "dev"), send a chat message like
"Planera två middagar för 4 personer och bygg inköpslistan", and confirm in the
newest `data/sessions/*.jsonl` that `recipe_aggregate` was called and the reply
lists aggregated items (with pantry staples separated). Optionally exercise the
Willys hand-off by letting it add 1–2 items to the cart.

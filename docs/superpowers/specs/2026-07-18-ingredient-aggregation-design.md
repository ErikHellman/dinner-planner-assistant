# Ingredient Aggregation — Design

**Date:** 2026-07-18
**Status:** Approved (plan-mode review with user; decisions below confirmed via AskUserQuestion)

## Goal

The "Tool for aggregating all the ingredients from the selected meals" from the
project plan: a deterministic aggregator that turns a set of selected
`recipeId`s (plus a servings count) into one shopping list, split into items to
buy and pantry staples, which the agent then feeds into the Willys cart tools.
No LLM involvement in the aggregation itself.

Deliverables:

1. Pure aggregation library in `src/lib/server/recipes/aggregate.ts`
2. CLI subcommand `recipes aggregate` (same CLI as search/get/ingredients)
3. Native Pi tool `recipe_aggregate` for the web agent
4. Agent skill `.agents/skills/shopping-list/SKILL.md` documenting the
   recipe → shopping-list → Willys-cart flow for CLI agents

## Decisions (made with the user)

1. **Servings:** one global `servings` parameter (default 2, integer ≥ 1)
   scales every amount by `servings / 2` — all recipe documents store exactly
   2 servings. Odd counts are allowed (3 → 1.5×).
2. **Pantry staples:** output has two sections — `items` (buy these) and
   `pantryStaples` (aggregated identically but assumed at home). An ingredient
   goes to `pantryStaples` only when **every** occurrence has `isBasis: true`;
   a single non-basis occurrence puts the whole group in `items`. (DB survey:
   only 3 conflicting names — ägg, mjölk, balsamvinäger — and "buy it" is the
   right call for all three.)
3. **Unit conversion — volumes only:** krm/tsk/msk/dl convert to a common ml
   base and sum. Weight (`g`) and count units (`st`, `klyfta`, `förp`, `påse`,
   `bit`, `burk`, `knippe`) sum only within the same unit. Incompatible units
   remain separate amount lines under the same ingredient. No piece↔weight
   equivalences — that would move hallucination into a deterministic tool.
4. **Output:** the tool/CLI returns the JSON **and** persists it to
   `data/plans/shopping-list.json` (git-ignored, atomic write) so the future
   web UI can display the latest list.

## Grounding facts (surveyed live against `data/recipes/`)

- 3660 ingredient lines across 200 docs; every line has a non-null `unit`.
- 12 distinct units: g 675, st 672, krm 656, tsk 484, förp 476, msk 218,
  klyfta 169, dl 167, påse 112, bit 22, burk 6, knippe 3.
- 42 folded names appear with more than one unit — all are either resolvable
  by the volume rule (olja tsk+msk) or legitimately stay as separate lines
  (äggnudlar g+förp).
- 636 lines have `amount: null` ("efter smak"), 592 of them pantry staples.
- 0 spelling variants after case/diacritic folding (`foldText`).

## Aggregation semantics

Pure function over `RecipeIngredientList[]` (the exact output of the existing
`RecipeStore.ingredients()`); no I/O.

1. **Input:** the ingredient lists plus `servings`. Duplicate recipeIds are
   legal and count double (cooking the same dish twice that week). Invalid
   `servings` (not an integer, < 1) throws `RecipeAggregateError`.
2. **Grouping key:** `foldText(name)` (existing normalizer — NFD, strip
   combining marks, lowercase). Display name = first-seen original spelling.
3. **Scaling:** every numeric amount × `servings / 2`. `null` amounts stay
   null.
4. **Bucketing within a group:**
   - Volume units convert to ml and sum in one bucket:
     `krm = 1`, `tsk = 5`, `msk = 15`, `dl = 100`, plus defensive aliases
     `ml = 1`, `l = 1000` (absent from the current DB but free to accept).
     Unit strings are matched case-insensitively via `foldText`.
   - Every other unit (`g`, `st`, `klyfta`, …, and defensively a null unit)
     is its own bucket keyed by the folded unit string; amounts sum within it.
   - `amount: null` lines contribute to no bucket; they set `toTaste: true`
     on the group. A group can have both numeric buckets and `toTaste` (salt
     "1 tsk" in one recipe, "efter smak" in another).
5. **Rounding:** all sums round to 2 decimals (`Math.round(v * 100) / 100`)
   to suppress float noise.
6. **Volume rendering:** the ml total is stored canonically as
   `{ value: <ml>, unit: "ml" }` (the project doc's `{value, unit}` shape) and
   rendered in `display` using the first of `dl` (÷100), `msk` (÷15),
   `tsk` (÷5), `krm` (÷1) whose converted value is a multiple of 0.25
   (float-safe: `|v*4 − round(v*4)| < 1e-9`); fallback is the ml value itself.
   Examples: 45 ml → `"3 msk"`, 50 ml → `"0.5 dl"`, 7 ml → `"7 krm"`.
7. **Non-volume rendering:** `display` is `"<value> <unit>"` (bare value when
   the unit is null). Numbers use dot decimals with no trailing zeros; the
   LLM localizes for the user.
8. **Ordering:** `items` and `pantryStaples` sort by display name with
   Swedish collation (`localeCompare(name, 'sv')`). Within a group, `amounts`
   sort by unit string (`localeCompare(unit, 'sv')`, null last). Per-item
   `recipeIds` provenance is unique, ascending.
9. **Partitioning:** groups where every occurrence is `isBasis` go to
   `pantryStaples`; all others go to `items` (decision 2).

## Output schema

```typescript
export interface AggregatedAmount {
	/** Canonical machine value, e.g. 45 (ml) or 300 (g). */
	value: number;
	/** Canonical unit: "ml" for the volume bucket, otherwise the source unit. */
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
	generatedAt: string; // ISO timestamp
}
```

Example (servings 4, two recipes sharing gul lök):

```json
{
	"servings": 4,
	"recipes": [
		{ "recipeId": 125524, "name": "Laxpanna med dill" },
		{ "recipeId": 36553, "name": "Kycklinggryta" }
	],
	"items": [
		{
			"name": "gul lök",
			"amounts": [{ "value": 300, "unit": "g", "display": "300 g" }],
			"toTaste": false,
			"recipeIds": [36553, 125524]
		}
	],
	"pantryStaples": [
		{
			"name": "salt",
			"amounts": [{ "value": 10, "unit": "ml", "display": "2 tsk" }],
			"toTaste": true,
			"recipeIds": [36553, 125524]
		}
	],
	"generatedAt": "2026-07-18T12:00:00.000Z"
}
```

## Components

### `src/lib/server/recipes/aggregate.ts` (new)

- `RecipeAggregateError` — repo error-class convention (`name` set in the
  constructor, `ErrorOptions` passed through).
- `aggregateIngredients(lists: RecipeIngredientList[], servings: number)` →
  `{ items, pantryStaples }`. Pure; fully unit-testable.
- `buildShoppingList(store: RecipeStore, recipeIds: number[], servings: number)`
  → `Promise<ShoppingList>`. Loads via `store.ingredients()` (all-or-nothing
  on bad ids — existing store behavior, `RecipeQueryError` propagates), calls
  the pure aggregator, stamps `recipes` and `generatedAt`.
- `defaultShoppingListPath()` → `path.resolve(process.cwd(), 'data/plans/shopping-list.json')`.
- `saveShoppingList(list: ShoppingList, filePath?: string)` → `Promise<string>`
  (the path written). Creates the directory, writes pretty JSON + trailing
  newline via the shared atomic write, returns the resolved path.

### `src/lib/server/recipes/atomic-write.ts` (new — small refactor)

`writeFileAtomic` moves out of `harvest.ts` (write `${file}.tmp`, rename,
unlink on error) so both harvester and aggregator share it. `harvest.ts`
imports it; behavior unchanged.

### CLI (`src/lib/server/recipes/cli.ts`)

```
recipes aggregate <recipeId...> [--servings N]
```

- Existing `parseFlags` allowlist pattern (`--servings` only). Ids must be
  integers, `--servings` a positive integer; otherwise usage (exit 64).
- Writes the file, logs `Saved shopping list to <path>` on stderr, prints the
  full `ShoppingList` JSON on stdout. Runtime failure (bad id, unreadable DB)
  → message on stderr, exit 1. Usage line added to `usage()`.

### Pi tool (`src/lib/server/agent/tools/recipes.ts`)

`recipe_aggregate` added to `createRecipeTools()` (auto-wired into the agent —
`session.ts` untouched):

- Parameters: `recipeIds` (array of `Type.Integer({ minimum: 1 })`,
  minItems 1), `servings` (optional `Type.Integer({ minimum: 1 })`,
  default 2).
- Executes `buildShoppingList` + `saveShoppingList`, returns the
  `ShoppingList` via the existing `ok()` helper.
- Description tells the agent: aggregates selected recipes into one shopping
  list scaled to `servings`; `items` are groceries to buy, `pantryStaples`
  assumed at home; the list is also saved to `data/plans/shopping-list.json`.
- `fail()` is extended to pass `RecipeAggregateError` messages through
  verbatim, exactly like `RecipeQueryError` today.

### System prompt (`src/lib/server/agent/prompt.ts`)

Add the flow: once the user has settled on recipes and servings, call
`recipe_aggregate` with the chosen recipeIds; build the Willys cart from
`items` (search per ingredient, add matching products), skipping
`pantryStaples` unless the user asks to include them.

### Skill (`.agents/skills/shopping-list/SKILL.md`, new)

For CLI agents (Claude Code / Pi CLI) — the web agent uses the native tools.
Documents the end-to-end flow:

1. Find recipes: `npm run --silent recipes -- search …` (see the `recipes`
   skill).
2. Aggregate: `npm run --silent recipes -- aggregate <ids…> --servings N`.
3. Shop: match each `items` entry to a product via
   `npm run --silent willys -- search <name>`, then `cart add` (see
   `docs/willys-cli.md`); pick pack sizes that cover the required amount.

Plus: output shape, pantry-staples/`toTaste` semantics, volume-conversion
note, exit codes, "no checkout" reminder. The `recipes` skill gets the
`aggregate` command added to its command list and a cross-reference.

### Housekeeping

- `.gitignore`: add `/data/plans/`.
- `CLAUDE.md`: Architecture (aggregate module + tool), Commands (aggregate
  example), Future milestones (ingredient aggregation done; remaining:
  preferences, web UI for plans).

## Error handling

| Failure | Behavior |
| --- | --- |
| Unknown/invalid recipeId | `RecipeQueryError` from the store (all-or-nothing); CLI exit 1, tool returns the message verbatim |
| Invalid `servings` | `RecipeAggregateError` (CLI validates first → exit 64; tool schema enforces `minimum: 1`, library re-validates) |
| DB missing/corrupt | Existing `RecipeQueryError` messages ("run harvest", "could not be read") propagate |
| File write failure | Error propagates (CLI exit 1 / tool error); atomic write leaves no partial file |

## Testing

- `aggregate.test.ts` (pure function + save): volume conversion and display
  rule (incl. 45/50/7 ml examples and the ml fallback), per-unit buckets and
  incompatible-unit separation, basis partition policy incl. the mixed
  ägg/mjölk case, `toTaste` with and without numeric buckets, scaling (4 and
  odd 3 servings), duplicate recipeIds counting double, provenance
  uniqueness/order, sv-collation sorting, 2-decimal rounding,
  `saveShoppingList` writes atomically into a temp dir and creates parents.
- `recipes.test.ts`: `recipe_aggregate` happy path (fixture store dir,
  temp output path), store-error path (message verbatim), default servings.
- Existing harvest tests keep passing after the atomic-write refactor.
- E2E (manual, verification phase): CLI run against the real DB with
  hand-checked sums; web-chat round trip confirming the `recipe_aggregate`
  call in `data/sessions/` JSONL.

## Out of scope

- Piece↔weight or piece↔volume equivalences (e.g. "1 lök ≈ 150 g").
- Product matching / cart population logic — that stays with the agent using
  the existing Willys tools.
- Web UI rendering of `data/plans/shopping-list.json` (future milestone).
- Food-preferences documents and per-recipe servings (future milestone).

# Recipe Database (Linas matkasse) — Design

Date: 2026-07-18
Status: Approved by user (design presented in chat; user said "Looks good. Please proceed.")

## Goal

Build a local, file-based recipe database of all ~200 recipes in the
"Kalorisnål" category of Linas matkasse's receptbank, normalized to
2 servings, including recipe photos. Expose it three ways:

1. **npm-script CLI** (`npm run recipes -- …`) — harvest, search, get,
   ingredients.
2. **Native Pi tools** (`recipe_search`, `recipe_get`,
   `recipe_ingredients`) for the web app's shell-free agent.
3. **Pi skill** (`.agents/skills/recipes/SKILL.md`) documenting the npm
   scripts for CLI-based agents, per the project plan's skill vision.

The database (JSON documents + images) is committed to git.

## Decisions made with the user

- **Source:** `https://www.linasmatkasse.se/receptbank/kalorisnal`
  (~200 recipes, paginated), not the weekly menu page (~29 recipes).
- **Servings:** normalize to **2 servings** (overrides the project plan
  doc's "one serving"; Linas natively publishes a size-2 variant so no
  scaling math is involved).
- **Images:** recipe hero photos only (large + small). No ingredient
  thumbnails.
- **Git:** commit everything — JSON docs and images under
  `data/recipes/`.
- **Agent access:** native Pi customTools sharing one library with the
  CLI (same pattern as Willys). The web agent stays shell-free.
  Harvesting is deliberately **not** exposed as an agent tool.

## Verified site contract (reverse-engineered 2026-07-18)

All pages are Next.js (pages router) and embed their data in
`<script id="__NEXT_DATA__" type="application/json" nonce="">…</script>`.
The extraction regex must allow extra attributes:
`/<script id="__NEXT_DATA__"[^>]*>(.*?)<\/script>/s`. No login or
cookies required; send a browser-like `User-Agent`. The `/_next/data/…`
JSON routes return HTML (blocked) — always parse the HTML pages.

### Listing pages

`GET https://www.linasmatkasse.se/receptbank/kalorisnal` (page 1) and
`…/receptbank/kalorisnal/{page}` for pages 2…N.

`props.pageProps` contains:

- `page` (number), `totalPages` (number; 10 as of 2026-07-18)
- `recipes[]` — 20 per page, each
  `{ recipeId, recipeName, cookingTimeMin, cookingTimeMax, images }`
- `categories[]` — sub-category slugs (snabblagad, fågel, kött, fisk,
  soppa, skaldjur). These are filtered views of the same recipes; the
  flat pagination covers everything, so sub-categories are ignored.

### Detail pages

`GET https://www.linasmatkasse.se/recept/{recipeId}/{slug}` — any slug
works (verified with a made-up slug); only the id matters.

`props.pageProps.initialState.api.queries` has exactly one key of the
form `recipeAndSteps({"recipeId":N})`; its `.data.recipeAndSteps` is the
full recipe:

- `recipeId`, `mainRecipeId` (stable across weekly re-issues),
  `recipeName`, `recipeNameHeadline`, `recipeNameSubheadline`,
  `recipeDescription` (often null), `chefTip` (often null),
  `mainIngredient` (e.g. "Fisk", "Vegetariskt"),
  `cookingTimeMin`/`cookingTimeMax` (numeric strings),
  `averageRating`, `numberOfRatings`, `shelfLife`
- `images.urls[]` — `{size: "small"|"large", url}` on
  `pimimages.azureedge.net`
- `taxonomies[]` — `{name, type, description, taxonomyId}`. Types
  observed: `category_tag`, `marketing_tag`, `special_food_tag`,
  `recipe` (cuisine, e.g. Mediterranean), `onesub` (English synonyms,
  e.g. Vegetarian, Low calorie), `menu_planner_seasons`,
  `recipe_chefs_internal`, `menu_planning`.
- `instructions.portions[]` — one entry per portion size
  (`size` is a **string**: "2","3","4","5","6"; order varies). Each:
  - `allergies[]` — `{id, name, hasTraceOf, showAllergy, parentAllergy}`
  - `stepSections[]` — `{sectionTitle, steps[{order, step}]}` where
    `step` is HTML: entities (`&auml;` …) and tags (`<strong>`)
  - `ingredientSections[]` — `{sectionTitle, ingredients[]}` with
    `{order, name, amount, ingredientAmountType, isBasis, images}`.
    `amount` is a string and dirty: "10", "½", "0", `null`/"null".
    Units (`ingredientAmountType`): g, st, tsk, msk, krm, ml, påse,
    förp, …
  - `nutritionFacts` —
    `{totalWeight, kcal, kcalPerPortion, recipeNutritionPerPortion:
    {carbs, energyKcal, fat, protein}, recipeNutritionPer100g}`
  - `co2eKgPerPortion`, `pdfUrl`

Every recipe checked (new and years-old) has a size-2 portion.

## Architecture

New library `src/lib/server/recipes/`, mirroring the Willys layout
(isolated under `src/lib/server/`, shared by CLI and agent tools):

| File | Responsibility |
| --- | --- |
| `types.ts` | `RecipeDoc` (our document), raw payload types |
| `scrape.ts` | HTTP fetch + `__NEXT_DATA__` extraction for listing and detail pages |
| `normalize.ts` | raw `recipeAndSteps` → `RecipeDoc` (pure, unit-tested) |
| `harvest.ts` | orchestrates listing → details → docs + images on disk |
| `query.ts` | `searchRecipes`, `getRecipe`, `getIngredients` over `data/recipes/*.json` |
| `cli.ts` | thin CLI: `harvest`, `search`, `get`, `ingredients` |

Plus:

- `src/lib/server/agent/tools/recipes.ts` — `createRecipeTools()` → 3
  Pi tools, `guarded/ok/fail` pattern copied from `tools/willys.ts`
- `src/lib/server/agent/session.ts` — register the recipe tools
- `src/lib/server/agent/prompt.ts` — describe the recipe tools
- `.agents/skills/recipes/SKILL.md` — skill doc for the npm scripts
- `package.json` — `"recipes": "node --import tsx src/lib/server/recipes/cli.ts"`
  (no `.env` needed — the source is public)

## Document schema

One file per recipe: `data/recipes/{recipeId}.json`. Images:
`data/recipes/images/{recipeId}-large.jpg` and `…-small.jpg`.

```json
{
	"recipeId": 125524,
	"mainRecipeId": 46441,
	"name": "Varmrökt lax med äppelsallad och dillsås",
	"headline": "Varmrökt lax",
	"subheadline": "med äppelsallad och dillsås",
	"description": null,
	"chefTip": null,
	"mainIngredient": "Fisk",
	"servings": 2,
	"cookingTime": { "min": 15, "max": 20 },
	"categories": ["Fisk och skaldjur", "Utan gluten", "Kalorisnål", "Low calorie"],
	"allergies": ["Mjölk", "Laktos", "Svaveldioxid", "Fisk"],
	"nutritionPerServing": { "energyKcal": 556, "protein": 29.53, "carbs": 53.42, "fat": 24.96 },
	"co2eKgPerServing": 1.05,
	"rating": { "average": 4.06, "count": 584 },
	"ingredients": [
		{
			"section": "Dillsås",
			"name": "gräddfil",
			"amount": 150,
			"unit": "g",
			"raw": "150 g gräddfil",
			"isBasis": false
		}
	],
	"instructions": [{ "step": 1, "section": null, "text": "Koka potatis i lättsaltat vatten. …" }],
	"images": { "large": "images/125524-large.jpg", "small": "images/125524-small.jpg" },
	"source": {
		"url": "https://www.linasmatkasse.se/recept/125524/varmrokt-lax-med-appelsallad-och-dillsas",
		"harvestedAt": "2026-07-18T12:00:00.000Z"
	}
}
```

Normalization rules:

- **Portion selection:** use the portion with `size === "2"`. If a
  recipe has no size-2 portion, skip it and report it in the harvest
  summary (never scale other sizes).
- **Categories:** unique `name`s of taxonomies with `type` in
  `{category_tag, marketing_tag, special_food_tag, recipe, onesub}`
  (Swedish + English synonyms + cuisines). Drop
  `menu_planner_seasons`, `recipe_chefs_internal`, `menu_planning`
  (internal planning noise).
- **Steps:** flatten `stepSections` in order; decode HTML entities,
  strip tags; `section` carries `sectionTitle` (usually null).
- **Ingredients:** flatten `ingredientSections`, keeping `section`.
  Parse `amount`: handle plain numbers, comma decimals, and unicode
  fractions ("½" → 0.5); `"0"`, `"null"`, `null`, and unparseable →
  `amount: null`. Always keep `raw` (`"<amount> <unit> <name>"` as
  displayed) and `unit` verbatim so nothing is lost for future
  ingredient aggregation. Keep `isBasis` (pantry staples the user is
  assumed to have).
- **Nutrition:** from `nutritionFacts.recipeNutritionPerPortion`
  (per-serving by construction). `null` if absent.
- **Image paths** in the doc are relative to `data/recipes/`.

## Harvester behavior

1. Fetch listing page 1 → `totalPages`; fetch pages 2…N. Collect all
   `recipeId`s (order preserved).
2. Skip ids that already have `data/recipes/{id}.json` unless
   `--force`. `--limit N` caps how many new recipes are fetched (for
   testing).
3. Fetch each remaining detail page with concurrency 4 and ~150 ms
   spacing (politeness); browser-like User-Agent.
4. Normalize → write doc; download the large + small hero images
   (skip download if the file already exists).
5. Per-recipe failures (fetch error, missing size-2 portion, missing
   `recipeAndSteps`) are caught, logged to stderr, and collected;
   the run continues. Exit 0 with a summary
   (`{harvested, skipped, failed: [{recipeId, reason}]}` to stdout);
   exit 1 only if the listing itself cannot be fetched.
6. Re-running is the upgrade path: the receptbank gains recipes over
   time and the harvester is idempotent.

## Query semantics

Load all `data/recipes/*.json` into memory per invocation (~200 docs,
a few MB — no index, no cache).

- **Matching** is case- and diacritic-insensitive substring matching:
  both haystack and needle are lowercased and stripped of combining
  marks via `normalize('NFD').replace(/[̀-ͯ]/g, '')`, so
  `kalorisnal` matches `Kalorisnål`.
- `searchRecipes({ query?, category?, maxTimeMinutes?, maxKcal? })`:
  - `query` matches recipe `name` OR any ingredient `name`
  - `category` matches any of `categories` OR `mainIngredient`
  - `maxTimeMinutes` compares against `cookingTime.max`
  - `maxKcal` compares against `nutritionPerServing.energyKcal`
  - filters AND-combine; no filters → all recipes
  - returns compact hits sorted by name:
    `{recipeId, name, mainIngredient, categories, cookingTime,
    energyKcalPerServing, rating}` — not full docs (LLM-friendly)
- `getRecipe(recipeId)` → the full `RecipeDoc`; clear error if absent.
- `getIngredients(recipeIds[])` → per-recipe
  `{recipeId, name, servings, ingredients[]}` — the input for future
  ingredient aggregation.

## CLI

`npm run recipes -- <command>` (use `--silent` when piping, same npm
banner caveat as the Willys CLI):

| Command | Behavior |
| --- | --- |
| `harvest [--force] [--limit N]` | build/refresh the database |
| `search [--query q] [--category c] [--max-time m] [--max-kcal k]` | compact hits |
| `get <recipeId>` | full document |
| `ingredients <recipeId…>` | ingredients for one or more recipes |

Contract identical to the Willys CLI: JSON on stdout, status/errors on
stderr, exit codes 0 (ok), 1 (runtime error), 64 (usage).

## Agent tools

`src/lib/server/agent/tools/recipes.ts` exports
`createRecipeTools(): ToolDefinition[]`:

- `recipe_search` — params `{query?, category?, maxTimeMinutes?,
  maxKcal?}`, wraps `searchRecipes`
- `recipe_get` — `{recipeId: number}`, wraps `getRecipe`
- `recipe_ingredients` — `{recipeIds: number[]}`, wraps
  `getIngredients`

No harvest tool. Registered in `session.ts` next to the Willys tools;
`prompt.ts` gains a short section telling the agent it has a local
Kalorisnål recipe database (2 servings per recipe) and should use these
tools when planning dinners.

## Skill

`.agents/skills/recipes/SKILL.md` with YAML frontmatter
(`name: recipes`, one-line `description`) documenting the npm scripts,
their arguments, and the JSON output shapes — enough for a CLI agent
(Pi/Claude Code) to drive the database without reading source.

## Testing

- **Fixtures:** trimmed real payloads saved under
  `src/lib/server/recipes/fixtures/` (one listing page, one full
  `recipeAndSteps`).
- **Unit (Vitest):**
  - `scrape`: `__NEXT_DATA__` extraction (incl. the nonce attribute),
    listing + detail payload navigation, clear error when markers are
    missing
  - `normalize`: size-2 selection regardless of array order; entity
    decoding + tag stripping; amount parsing ("10", "1,5", "½", "0",
    "null", null); taxonomy filtering; missing size-2 → typed error
  - `query`: diacritic/case folding, each filter, AND-combination,
    ingredient-name matching, `getRecipe` missing-id error
- **Live (opt-in, `RECIPES_LIVE=1`):** fetch listing page 1 (shape
  asserted), fetch + normalize one real recipe end-to-end.
- **Final verification:** `npm run check`, `npm run lint`, `npm test`,
  full live harvest into `data/recipes/`, spot-check via CLI and via
  the chat agent, then commit code + data.

## Out of scope

- Ingredient aggregation across recipes (future milestone; `raw` +
  `unit` are preserved for it).
- Other receptbank categories (harvester is kalorisnal-only for now;
  the category is a constant that could later become a flag).
- Scaling portions to sizes other than 2.
- Any Willys/grocery integration changes.

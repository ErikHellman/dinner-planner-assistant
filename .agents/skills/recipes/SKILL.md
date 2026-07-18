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
- Unknown flags are rejected with a usage message (exit 64).
- Exit codes: 0 ok, 1 runtime error, 64 usage error.

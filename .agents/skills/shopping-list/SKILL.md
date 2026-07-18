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
npm run --silent recipes -- aggregate 36553 100988 --servings 4

# 3. For each entry in "items": find a matching product and add it to the cart
npm run --silent willys -- search "gul lök"
npm run --silent willys -- cart add 101233933_ST 1
```

Step 2 prints the shopping list JSON on stdout and also saves it to
`data/plans/shopping-list.json`. Aggregate ONCE with the full set of chosen
recipeIds — every run recomputes and overwrites the saved list.

## Output shape

```json
{
	"servings": 4,
	"recipes": [{ "recipeId": 36553, "name": "…" }],
	"items": [
		{
			"name": "vitlök",
			"amounts": [{ "value": 8, "unit": "klyfta", "display": "8 klyfta" }],
			"toTaste": false,
			"recipeIds": [36553, 100988]
		}
	],
	"pantryStaples": [/* same shape */],
	"generatedAt": "…"
}
```

- `items` — groceries to buy. `pantryStaples` — aggregated the same way, but
  the user is assumed to have them at home; skip them unless asked.
- `amounts` — one entry per unit family. Merged volumes use `unit: "ml"` with a
  kitchen-friendly `display` ("2 msk"); other units (g, st, förp, …) keep their
  own entry. Incompatible units are never guessed into each other.
- `toTaste: true` — at least one recipe uses the ingredient "efter smak"
  (no amount); `amounts` may then be empty.
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

---
name: shopping-list
description: Aggregate ingredients from selected recipes into a weekly plan document and populate the Willys grocery cart via CLI
---

# Shopping list / weekly plan

Turn chosen recipes from the local recipe database into one week's plan — an
aggregated shopping list saved per ISO week — then fill the Willys online
grocery cart from it and record the chosen products back into the plan.
Aggregation is fully deterministic — same-name ingredients merge, volume units
(krm/tsk/msk/dl) sum together, and amounts scale to the requested servings.

## Workflow

```bash
# 1. Find and pick recipes (see the recipes skill for all filters)
npm run --silent recipes -- search --query lax --max-kcal 600

# 2. Aggregate the chosen recipeIds into the week's plan (default 2 servings,
#    current ISO week)
npm run --silent recipes -- aggregate 36553 100988 --servings 4 --week 2026-W30

# 3. For each entry in "shoppingList.items": find a matching product, add it
npm run --silent willys -- search "gul lök"
npm run --silent willys -- cart add 101233933_ST 1

# 4. Record the filled cart into the week's plan (the web app shows it under
#    Veckans recept, and the snapshot can re-create the cart later)
npm run --silent willys -- cart record --week 2026-W30
```

Step 2 prints the plan JSON on stdout and saves it to
`data/plans/<week>.json` (e.g. `data/plans/2026-W30.json`). Aggregate ONCE
with the full set of chosen recipeIds — every run recomputes and overwrites
that week's plan and resets its recorded `willysCart` to null (so run step 4
again after refilling).

## Plan document shape

```json
{
	"version": 1,
	"weekId": "2026-W30",
	"servings": 4,
	"recipes": [{ "recipeId": 36553, "name": "…" }],
	"shoppingList": {
		"items": [
			{
				"name": "vitlök",
				"amounts": [{ "value": 8, "unit": "klyfta", "display": "8 klyfta" }],
				"toTaste": false,
				"recipeIds": [36553, 100988]
			}
		],
		"pantryStaples": [/* same shape */]
	},
	"willysCart": {
		"recordedAt": "…",
		"lines": [{ "productId": "101233933_ST", "quantity": 1, "pickUnit": "pieces" /* … */ }],
		"subtotal": { "amount": 123.5, "formatted": "123,50 kr" }
	},
	"generatedAt": "…",
	"updatedAt": "…"
}
```

- `shoppingList.items` — groceries to buy. `pantryStaples` — aggregated the
  same way, but the user is assumed to have them at home; skip unless asked.
- `amounts` — one entry per unit family. Merged volumes use `unit: "ml"` with a
  kitchen-friendly `display` ("2 msk"); other units (g, st, förp, …) keep their
  own entry. Incompatible units are never guessed into each other.
- `toTaste: true` — at least one recipe uses the ingredient "efter smak"
  (no amount); `amounts` may then be empty.
- Duplicate recipeIds are allowed and count double (same dish twice that week).
- `willysCart` — null until `cart record` runs; its lines
  (`productId` + `quantity` + `pickUnit`) are everything needed to re-populate
  the cart.

## Shopping tips

- Search Willys with the plain ingredient name (`display` is a cooking measure,
  not a package size); pick a package that covers the required amount.
- Prefer piece-priced products (codes ending `_ST`). Weight-priced `_KG`
  products have tricky semantics: the cart REPORTS their quantity in grams,
  but the quantity you SET counts pieces (of the ca-weight in the display
  size) — never echo the gram figure back as a quantity.
- Checkout is intentionally not possible; only cart management. The user
  completes the purchase on willys.se.

## Exit codes (recipes CLI)

`0` ok · `1` runtime error (e.g. unknown recipeId — the whole aggregation
fails rather than producing an incomplete list) · `64` usage error.

## Related

- `recipes` skill — searching the database, full recipe details.
- `docs/willys-cli.md` — full Willys CLI reference (login, cart semantics).

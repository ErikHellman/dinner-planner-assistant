import { defineTool, type ToolDefinition } from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';
import { buildShoppingList, RecipeAggregateError } from '../../recipes/aggregate';
import { RecipeQueryError, RecipeStore } from '../../recipes/query';
import { createWeeklyPlan, PlanStore, PlanStoreError } from '../../plans/store';
import { currentWeekId } from '../../../plans/week';

function ok(data: unknown): { content: { type: 'text'; text: string }[]; details: unknown } {
	return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }], details: data };
}

function fail(err: unknown): { content: { type: 'text'; text: string }[]; details: unknown } {
	const message =
		err instanceof RecipeQueryError ||
		err instanceof RecipeAggregateError ||
		err instanceof PlanStoreError
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

/** Native Pi tools over the local Linas matkasse recipe database. Read-only except for
 * recipe_aggregate persisting the week's plan document; no harvest tool. */
export function createRecipeTools(
	store: RecipeStore,
	deps: { plans: PlanStore }
): ToolDefinition[] {
	return [
		defineTool({
			name: 'recipe_search',
			label: 'Recipe search',
			description:
				'Search the local recipe database (~200 kalorisnål dinner recipes from Linas matkasse, each stored for exactly 2 servings). All filters are optional and AND-combined. Returns compact hits: recipeId, name, categories, cooking time, kcal per serving, rating.',
			promptSnippet:
				'recipe_search(query?, category?, maxTimeMinutes?, maxKcal?): find dinner recipes',
			parameters: Type.Object({
				query: Type.Optional(
					Type.String({
						description: 'Matches recipe name or ingredient names, e.g. "lax" or "kyckling"'
					})
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
				recipeId: Type.Integer({ minimum: 1, description: 'Numeric recipeId from recipe_search' })
			}),
			execute: (_id, params) => guarded(() => store.get(params.recipeId))
		}),
		defineTool({
			name: 'recipe_ingredients',
			label: 'Recipe ingredients',
			description:
				'Raw per-recipe ingredient lists (2 servings each, not merged or scaled) for one or more recipes. For a combined shopping list use recipe_aggregate instead. Ingredients with isBasis=true are pantry staples the user likely has.',
			promptSnippet: 'recipe_ingredients(recipeIds): ingredients per recipe',
			parameters: Type.Object({
				recipeIds: Type.Array(Type.Integer({ minimum: 1 }), {
					description: 'recipeIds from recipe_search',
					minItems: 1
				})
			}),
			execute: (_id, params) => guarded(() => store.ingredients(params.recipeIds))
		}),
		defineTool({
			name: 'recipe_aggregate',
			label: 'Weekly plan',
			description:
				"Aggregate the chosen recipes into the week's plan: ONE shopping list scaled to the requested servings (recipes are stored for 2; duplicates count double). Same-name ingredients merge; volume units (krm/tsk/msk/dl) sum together in ml with a human-readable display, other units sum per unit. The plan document (data/plans/<week>.json) contains shoppingList.items (groceries to buy) and shoppingList.pantryStaples (assumed at home — skip when filling the cart unless asked). Call it once with the FULL set of chosen recipeIds — each call recomputes and OVERWRITES that week's plan (it does not merge across calls) and resets any recorded willysCart snapshot to null, so call plan_record_cart again after refilling the cart.",
			promptSnippet: "recipe_aggregate(recipeIds, servings?, week?): build the week's plan",
			parameters: Type.Object({
				recipeIds: Type.Array(Type.Integer({ minimum: 1 }), {
					description: 'recipeIds of the chosen recipes, from recipe_search',
					minItems: 1
				}),
				servings: Type.Optional(
					Type.Integer({ minimum: 1, description: 'Servings per recipe (default 2)' })
				),
				week: Type.Optional(
					Type.String({
						description: 'ISO week id like "2026-W30"; defaults to the current week'
					})
				)
			}),
			execute: (_id, params) =>
				guarded(async () => {
					const weekId = params.week ?? currentWeekId();
					const list = await buildShoppingList(store, params.recipeIds, params.servings ?? 2);
					const { plan } = await deps.plans.save(createWeeklyPlan(list, weekId));
					return plan;
				})
		})
	];
}

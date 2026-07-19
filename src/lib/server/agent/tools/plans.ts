import { defineTool, type ToolDefinition } from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';
import { PlanStore, PlanStoreError } from '../../plans/store';
import { buildPlanHistory, clampHistoryWeeks, HISTORY_DEFAULT_WEEKS } from '../../plans/history';
import { currentWeekId } from '../../../plans/week';
import { WillysConfigError } from '../../willys/config';
import type { WillysClient } from '../../willys/client';
import type { NormalizedCart } from '../../willys/types';
import type { CartCoverageEntry, WillysCartSnapshot } from '../../../plans/types';
import { buildCoverageDiff } from '../../../plans/coverage';

function ok(data: unknown): { content: { type: 'text'; text: string }[]; details: unknown } {
	return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }], details: data };
}

function fail(err: unknown): { content: { type: 'text'; text: string }[]; details: unknown } {
	const message =
		err instanceof PlanStoreError || err instanceof WillysConfigError
			? err.message
			: `Plan tool error: ${err instanceof Error ? err.message : String(err)}`;
	return { content: [{ type: 'text', text: message }], details: { error: message } };
}

async function guarded(run: () => Promise<unknown>) {
	try {
		return ok(await run());
	} catch (err) {
		return fail(err);
	}
}

function snapshotFromCart(cart: NormalizedCart, coverage: CartCoverageEntry[]): WillysCartSnapshot {
	return {
		recordedAt: new Date().toISOString(),
		store: cart.store,
		itemCount: cart.itemCount,
		totalQuantity: cart.totalQuantity,
		lines: cart.lines,
		subtotal: cart.subtotal,
		coverage
	};
}

const COVERAGE_PARAM = Type.Optional(
	Type.Array(
		Type.Object({
			productId: Type.String({ description: 'Product in the cart, e.g. 101233933_ST' }),
			covers: Type.Array(Type.String(), {
				description: "Shopping-list item names this product buys, spelled as in the plan's list"
			})
		}),
		{
			description:
				'Which shopping-list items each cart product was bought for. Without it the app cannot tell which ingredients are actually covered.'
		}
	)
);

const WEEK_PARAM = Type.Optional(
	Type.String({ description: 'ISO week id like "2026-W30"; defaults to the current week' })
);

/** Native Pi tools for the week-keyed plan documents in data/plans/. */
export function createPlanTools(deps: {
	willys: WillysClient;
	plans: PlanStore;
}): ToolDefinition[] {
	return [
		defineTool({
			name: 'plan_record_cart',
			label: 'Record cart in plan',
			description:
				"Snapshot the CURRENT Willys cart into the week's plan document so the app can show (and later re-create) the chosen products. Call it after filling the cart from the aggregated shopping list. Requires the week to already have a plan (recipe_aggregate first) and a non-empty cart. Re-aggregating the week clears the snapshot — record again after refilling. ALWAYS pass coverage: it is the only link between an ingredient name and the product you bought for it, and without it every ingredient shows as unchecked.",
			promptSnippet:
				"plan_record_cart(week?, coverage?): save the Willys cart into the week's plan",
			parameters: Type.Object({ week: WEEK_PARAM, coverage: COVERAGE_PARAM }),
			execute: (_id, params) =>
				guarded(async () => {
					const weekId = params.week ?? currentWeekId();
					const plan = await deps.plans.load(weekId);
					if (!plan) {
						throw new PlanStoreError(
							`No plan for week ${weekId} — run recipe_aggregate for that week first.`
						);
					}
					const cart = await deps.willys.getCart();
					if (cart.lines.length === 0) {
						throw new PlanStoreError(
							'The Willys cart is empty — fill it before recording it into the plan.'
						);
					}
					return deps.plans.setWillysSnapshot(
						weekId,
						snapshotFromCart(cart, params.coverage ?? [])
					);
				})
		}),
		defineTool({
			name: 'plan_cart_diff',
			label: 'Check cart against plan',
			description:
				"Compare the week's shopping list against the products recorded in its cart, using the coverage you passed to plan_record_cart. Returns matched items, unmatched items (ingredients nothing was bought for — fix these) and extra products. hasCoverage is false when no coverage was recorded, which means unknown, not that nothing matched. Call it after plan_record_cart to check your own work before telling the user the cart is ready.",
			promptSnippet: "plan_cart_diff(week?): check the cart covers the week's shopping list",
			parameters: Type.Object({ week: WEEK_PARAM }),
			execute: (_id, params) =>
				guarded(async () => {
					const weekId = params.week ?? currentWeekId();
					const plan = await deps.plans.load(weekId);
					if (!plan) {
						throw new PlanStoreError(
							`No plan for week ${weekId} — run recipe_aggregate for that week first.`
						);
					}
					return { weekId, ...buildCoverageDiff(plan) };
				})
		}),
		defineTool({
			name: 'plan_get',
			label: 'Get weekly plan',
			description:
				"Read a week's saved plan document (recipes, servings, shopping list, recorded Willys products) plus the list of all weeks that have plans. plan is null when the week has none.",
			promptSnippet: 'plan_get(week?): read the saved weekly plan',
			parameters: Type.Object({ week: WEEK_PARAM }),
			execute: (_id, params) =>
				guarded(async () => {
					const weekId = params.week ?? currentWeekId();
					const [plan, availableWeeks] = await Promise.all([
						deps.plans.load(weekId),
						deps.plans.listWeeks()
					]);
					return { weekId, plan, availableWeeks };
				})
		}),
		defineTool({
			name: 'plan_history',
			label: 'Recent weekly plans',
			description:
				'The most recent weekly plans, newest first — week id, status, servings and the recipes that were planned. Use it before proposing dinners so you know what was cooked recently and can avoid repeats. Shopping lists and recorded products are NOT included; use plan_get for one week in full.',
			promptSnippet: 'plan_history(weeks?): recently planned weeks and their recipes',
			parameters: Type.Object({
				weeks: Type.Optional(
					Type.Number({
						description: `How many recent weeks to return (default ${HISTORY_DEFAULT_WEEKS}, max 52)`
					})
				)
			}),
			execute: (_id, params) =>
				guarded(async () => ({
					weeks: await buildPlanHistory(deps.plans, clampHistoryWeeks(params.weeks))
				}))
		}),
		defineTool({
			name: 'plan_delete',
			label: 'Delete weekly plan',
			description:
				"Delete a week's saved plan document. Destructive and irreversible, so the week id is REQUIRED (no current-week default) — confirm with the user before calling. The Willys cart is untouched; clear it separately with willys_cart_clear if the user wants that too. deleted is false when the week had no plan.",
			promptSnippet: "plan_delete(week): delete the week's saved plan",
			parameters: Type.Object({
				week: Type.String({
					description: 'ISO week id like "2026-W30" of the plan to delete (required)'
				})
			}),
			execute: (_id, params) =>
				guarded(async () => {
					const deleted = await deps.plans.delete(params.week);
					return { weekId: params.week, deleted, availableWeeks: await deps.plans.listWeeks() };
				})
		})
	];
}

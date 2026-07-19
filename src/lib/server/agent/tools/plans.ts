import { defineTool, type ToolDefinition } from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';
import { PlanStore, PlanStoreError } from '../../plans/store';
import { currentWeekId } from '../../../plans/week';
import { WillysConfigError } from '../../willys/config';
import type { WillysClient } from '../../willys/client';
import type { NormalizedCart } from '../../willys/types';
import type { WillysCartSnapshot } from '../../../plans/types';

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

function snapshotFromCart(cart: NormalizedCart): WillysCartSnapshot {
	return {
		recordedAt: new Date().toISOString(),
		store: cart.store,
		itemCount: cart.itemCount,
		totalQuantity: cart.totalQuantity,
		lines: cart.lines,
		subtotal: cart.subtotal
	};
}

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
				"Snapshot the CURRENT Willys cart into the week's plan document so the app can show (and later re-create) the chosen products. Call it after filling the cart from the aggregated shopping list. Requires the week to already have a plan (recipe_aggregate first) and a non-empty cart. Re-aggregating the week clears the snapshot — record again after refilling.",
			promptSnippet: "plan_record_cart(week?): save the Willys cart into the week's plan",
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
					const cart = await deps.willys.getCart();
					if (cart.lines.length === 0) {
						throw new PlanStoreError(
							'The Willys cart is empty — fill it before recording it into the plan.'
						);
					}
					return deps.plans.setWillysSnapshot(weekId, snapshotFromCart(cart));
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
		})
	];
}

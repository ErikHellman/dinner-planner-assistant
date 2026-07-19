import type { PlanStatus } from '../../plans/types';
import { type PlanStore, PlanStoreError } from './store';

/** How many weeks plan_history returns when the caller does not say. */
export const HISTORY_DEFAULT_WEEKS = 8;
const HISTORY_MIN_WEEKS = 1;
const HISTORY_MAX_WEEKS = 52;

/**
 * One week, stripped to what an agent needs to reason about rotation and
 * repeats. The shopping list and cart snapshot are deliberately left out —
 * they are the bulk of a plan document, and plan_get already serves the
 * "details of one week" case.
 */
export interface PlanSummary {
	weekId: string;
	status: PlanStatus;
	servings: number;
	recipes: { recipeId: number; name: string }[];
}

/** Clamp rather than reject: a nonsense `weeks` should degrade, not error. */
export function clampHistoryWeeks(weeks: number | undefined): number {
	if (weeks === undefined || !Number.isFinite(weeks)) return HISTORY_DEFAULT_WEEKS;
	return Math.min(HISTORY_MAX_WEEKS, Math.max(HISTORY_MIN_WEEKS, Math.floor(weeks)));
}

/**
 * The most recent `limit` weekly plans, newest first.
 *
 * Future weeks are included — a plan for next week is legitimate context, and
 * filtering on "now" would make the output depend on the clock. A corrupt plan
 * file is skipped rather than propagated, so one bad document cannot hide
 * every other week from the agent.
 */
export async function buildPlanHistory(store: PlanStore, limit: number): Promise<PlanSummary[]> {
	const weekIds = (await store.listWeeks()).slice(-limit).reverse();

	const summaries = await Promise.all(
		weekIds.map(async (weekId) => {
			try {
				const plan = await store.load(weekId);
				if (!plan) return null;
				return {
					weekId: plan.weekId,
					status: plan.status,
					servings: plan.servings,
					recipes: plan.recipes
				} satisfies PlanSummary;
			} catch (err) {
				if (err instanceof PlanStoreError) return null;
				throw err;
			}
		})
	);

	return summaries.filter((summary): summary is PlanSummary => summary !== null);
}

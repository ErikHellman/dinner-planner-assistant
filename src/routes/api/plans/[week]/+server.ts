import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { isPlanStatus, PlanStore, PlanStoreError } from '$lib/server/plans/store';
import { buildPlanRecipeViews } from '$lib/server/plans/views';
import { parseWeekId } from '$lib/plans/week';
import { defaultRecipesDir, RecipeStore } from '$lib/server/recipes/query';

const plans = new PlanStore();
const recipes = new RecipeStore(defaultRecipesDir());

function badWeek(week: string) {
	return json(
		{ error: `Invalid week id "${week}" — expected e.g. "2026-W29"`, code: 'bad_request' },
		{ status: 400 }
	);
}

function planError(err: unknown) {
	const message = err instanceof Error ? err.message : String(err);
	return json({ error: message, code: 'plan_error' }, { status: 500 });
}

/** One week's plan document joined with recipe display data. */
export const GET: RequestHandler = async ({ params }) => {
	if (!parseWeekId(params.week)) {
		return badWeek(params.week);
	}
	try {
		const plan = await plans.load(params.week);
		if (!plan) {
			return json({ error: `No plan for week ${params.week}`, code: 'not_found' }, { status: 404 });
		}
		return json({ plan, recipes: await buildPlanRecipeViews(plan.recipes, recipes) });
	} catch (err) {
		return planError(err);
	}
};

/** Partial update of a week's plan: currently only the lifecycle status. */
export const PATCH: RequestHandler = async ({ params, request }) => {
	if (!parseWeekId(params.week)) {
		return badWeek(params.week);
	}
	const body = (await request.json().catch(() => null)) as { status?: unknown } | null;
	if (!body || !isPlanStatus(body.status)) {
		return json(
			{ error: 'Expected { status: "new" | "ordered" }', code: 'bad_request' },
			{ status: 400 }
		);
	}
	try {
		return json({ plan: await plans.setStatus(params.week, body.status) });
	} catch (err) {
		// setStatus fails this way only when the week has no plan document.
		if (err instanceof PlanStoreError) {
			return json({ error: err.message, code: 'not_found' }, { status: 404 });
		}
		return planError(err);
	}
};

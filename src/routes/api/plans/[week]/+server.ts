import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { PlanStore } from '$lib/server/plans/store';
import { buildPlanRecipeViews } from '$lib/server/plans/views';
import { parseWeekId } from '$lib/plans/week';
import { defaultRecipesDir, RecipeStore } from '$lib/server/recipes/query';

const plans = new PlanStore();
const recipes = new RecipeStore(defaultRecipesDir());

/** One week's plan document joined with recipe display data. */
export const GET: RequestHandler = async ({ params }) => {
	if (!parseWeekId(params.week)) {
		return json(
			{ error: `Invalid week id "${params.week}" — expected e.g. "2026-W29"`, code: 'bad_request' },
			{ status: 400 }
		);
	}
	try {
		const plan = await plans.load(params.week);
		if (!plan) {
			return json({ error: `No plan for week ${params.week}`, code: 'not_found' }, { status: 404 });
		}
		return json({ plan, recipes: await buildPlanRecipeViews(plan.recipes, recipes) });
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return json({ error: message, code: 'plan_error' }, { status: 500 });
	}
};

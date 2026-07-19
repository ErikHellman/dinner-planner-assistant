import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { PlanStore } from '$lib/server/plans/store';
import { currentWeekId } from '$lib/plans/week';

const plans = new PlanStore();

/** Weeks that have a saved plan, plus today's week for the default selection. */
export const GET: RequestHandler = async () => {
	try {
		return json({ weeks: await plans.listWeeks(), currentWeek: currentWeekId() });
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		return json({ error: message, code: 'plan_error' }, { status: 500 });
	}
};

import { ApiError, apiFetch, messageFor } from '$lib/api/client';
import { addWeeks, currentWeekId } from './week';
import type { PlanRecipeView, PlanStatus, WeeklyPlan } from './types';

interface PlanResponse {
	plan: WeeklyPlan;
	recipes: PlanRecipeView[];
}

/** Client state for the Veckans recept tab. The selected week persists across
 * tab navigation; the plan itself is refetched on every load because the
 * agent rewrites plan documents mid-conversation. */
export class PlanViewStore {
	selectedWeek = $state(currentWeekId());
	plan = $state.raw<WeeklyPlan | null>(null);
	recipes = $state.raw<PlanRecipeView[]>([]);
	weeks = $state.raw<string[]>([]);
	status = $state<'idle' | 'loading'>('idle');
	/** A status write is in flight; keeps the toggle from firing twice. */
	saving = $state(false);
	error = $state<string | null>(null);
	#requestSeq = 0;

	async load(week: string = this.selectedWeek): Promise<void> {
		const token = ++this.#requestSeq;
		this.selectedWeek = week;
		this.status = 'loading';
		this.error = null;
		try {
			const weeksPromise = apiFetch<{ weeks: string[] }>('/api/plans');
			let plan: WeeklyPlan | null = null;
			let recipes: PlanRecipeView[] = [];
			try {
				const response = await apiFetch<PlanResponse>(`/api/plans/${week}`);
				plan = response.plan;
				recipes = response.recipes;
			} catch (err) {
				if (!(err instanceof ApiError) || err.status !== 404) throw err;
			}
			const { weeks } = await weeksPromise;
			if (token !== this.#requestSeq) return; // a newer load superseded this one
			this.plan = plan;
			this.recipes = recipes;
			this.weeks = weeks;
		} catch (err) {
			if (token !== this.#requestSeq) return;
			this.plan = null;
			this.recipes = [];
			this.error = messageFor(err);
		} finally {
			if (token === this.#requestSeq) this.status = 'idle';
		}
	}

	/** Mark the loaded week as ordered, or back to new. */
	async setStatus(status: PlanStatus): Promise<void> {
		const week = this.selectedWeek;
		if (!this.plan || this.saving) return;
		this.saving = true;
		this.error = null;
		try {
			const { plan } = await apiFetch<{ plan: WeeklyPlan }>(`/api/plans/${week}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ status })
			});
			// Drop the result if the user switched week while the write was in flight.
			if (week === this.selectedWeek) this.plan = plan;
		} catch (err) {
			this.error = messageFor(err);
		} finally {
			this.saving = false;
		}
	}

	previousWeek(): void {
		void this.load(addWeeks(this.selectedWeek, -1));
	}

	nextWeek(): void {
		void this.load(addWeeks(this.selectedWeek, 1));
	}

	goToCurrentWeek(): void {
		void this.load(currentWeekId());
	}
}

/** Module singleton: selection survives tab navigation. */
export const planViewStore = new PlanViewStore();

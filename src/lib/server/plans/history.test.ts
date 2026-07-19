import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ShoppingList } from '../recipes/aggregate';
import { createWeeklyPlan, PlanStore } from './store';
import { buildPlanHistory, HISTORY_DEFAULT_WEEKS, clampHistoryWeeks } from './history';

function list(recipes: { recipeId: number; name: string }[]): ShoppingList {
	return {
		servings: 4,
		recipes,
		items: [
			{
				name: 'potatis',
				amounts: [{ value: 800, unit: 'g', display: '800 g' }],
				toTaste: false,
				recipeIds: recipes.map((r) => r.recipeId)
			}
		],
		pantryStaples: [],
		generatedAt: '2026-07-19T10:00:00.000Z'
	};
}

describe('clampHistoryWeeks', () => {
	it('defaults when the parameter is absent', () => {
		expect(clampHistoryWeeks(undefined)).toBe(HISTORY_DEFAULT_WEEKS);
	});

	it('clamps out-of-range and nonsense values instead of failing', () => {
		expect(clampHistoryWeeks(0)).toBe(1);
		expect(clampHistoryWeeks(-5)).toBe(1);
		expect(clampHistoryWeeks(999)).toBe(52);
		expect(clampHistoryWeeks(3.7)).toBe(3);
		expect(clampHistoryWeeks(Number.NaN)).toBe(HISTORY_DEFAULT_WEEKS);
	});
});

describe('buildPlanHistory', () => {
	let dir: string;
	let store: PlanStore;

	beforeEach(async () => {
		dir = await mkdtemp(path.join(os.tmpdir(), 'history-'));
		store = new PlanStore(dir);
	});

	afterEach(async () => {
		await rm(dir, { recursive: true, force: true });
	});

	async function seed(weekId: string, recipes: { recipeId: number; name: string }[]) {
		await store.save(createWeeklyPlan(list(recipes), weekId));
	}

	it('returns an empty history when no plans exist', async () => {
		expect(await buildPlanHistory(store, 8)).toEqual([]);
	});

	it('summarizes plans newest first', async () => {
		await seed('2026-W28', [{ recipeId: 1, name: 'Lax' }]);
		await seed('2026-W30', [{ recipeId: 2, name: 'Kyckling' }]);
		await seed('2026-W29', [{ recipeId: 3, name: 'Pasta' }]);

		const history = await buildPlanHistory(store, 8);

		expect(history.map((p) => p.weekId)).toEqual(['2026-W30', '2026-W29', '2026-W28']);
		expect(history[0]).toEqual({
			weekId: '2026-W30',
			status: 'new',
			servings: 4,
			recipes: [{ recipeId: 2, name: 'Kyckling' }]
		});
	});

	it('omits the bulky shopping list and cart snapshot', async () => {
		await seed('2026-W30', [{ recipeId: 1, name: 'Lax' }]);

		const [summary] = await buildPlanHistory(store, 8);

		expect(summary).not.toHaveProperty('shoppingList');
		expect(summary).not.toHaveProperty('willysCart');
	});

	it('keeps only the most recent weeks up to the limit', async () => {
		await seed('2026-W27', [{ recipeId: 1, name: 'Lax' }]);
		await seed('2026-W28', [{ recipeId: 2, name: 'Pasta' }]);
		await seed('2026-W29', [{ recipeId: 3, name: 'Kyckling' }]);

		const history = await buildPlanHistory(store, 2);

		expect(history.map((p) => p.weekId)).toEqual(['2026-W29', '2026-W28']);
	});

	it('includes weeks in the future — a plan for next week is context too', async () => {
		await seed('2099-W01', [{ recipeId: 1, name: 'Lax' }]);

		expect((await buildPlanHistory(store, 8)).map((p) => p.weekId)).toEqual(['2099-W01']);
	});

	it('skips a corrupt plan file rather than blinding the agent to every week', async () => {
		await seed('2026-W29', [{ recipeId: 1, name: 'Lax' }]);
		await writeFile(path.join(dir, '2026-W30.json'), '{ not json', 'utf8');

		expect((await buildPlanHistory(store, 8)).map((p) => p.weekId)).toEqual(['2026-W29']);
	});
});

import { mkdtemp } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { createPlanTools } from './plans';
import { createWeeklyPlan, PlanStore } from '../../plans/store';
import { currentWeekId } from '../../../plans/week';
import { WillysConfigError } from '../../willys/config';
import type { WillysClient } from '../../willys/client';
import type { NormalizedCart } from '../../willys/types';
import type { ShoppingList } from '../../recipes/aggregate';
import type { WeeklyPlan } from '../../../plans/types';

const EXPECTED_NAMES = ['plan_record_cart', 'plan_get', 'plan_delete'];

const LIST: ShoppingList = {
	servings: 4,
	recipes: [{ recipeId: 1, name: 'Varmrökt lax' }],
	items: [
		{
			name: 'gul lök',
			amounts: [{ value: 300, unit: 'g', display: '300 g' }],
			toTaste: false,
			recipeIds: [1]
		}
	],
	pantryStaples: [],
	generatedAt: '2026-07-19T10:00:00.000Z'
};

const CART: NormalizedCart = {
	store: { id: '2583' },
	itemCount: 1,
	totalQuantity: 2,
	lines: [
		{
			productId: '101233933_ST',
			name: 'Gul Lök',
			brand: null,
			quantity: 2,
			pickUnit: 'pieces',
			unitPrice: { amount: 5, formatted: '5,00 kr', currency: 'SEK' },
			lineTotal: { amount: 10, formatted: '10,00 kr', currency: 'SEK' },
			categories: [],
			displaySize: null,
			imageUrl: 'https://assets.axfood.se/img/onion'
		}
	],
	subtotal: { amount: 10, formatted: '10,00 kr', currency: 'SEK' },
	deposit: { amount: 0, formatted: '', currency: 'SEK' },
	discountTotal: { amount: 0, formatted: '0,00 kr', currency: 'SEK' }
};

const EMPTY_CART: NormalizedCart = {
	...CART,
	itemCount: 0,
	totalQuantity: 0,
	lines: [],
	subtotal: { amount: 0, formatted: '', currency: 'SEK' }
};

/** Minimal mock of WillysClient — only the methods a given test exercises. */
function mockClient(overrides: Partial<WillysClient> = {}): WillysClient {
	return overrides as WillysClient;
}

let plans: PlanStore;

beforeEach(async () => {
	plans = new PlanStore(await mkdtemp(path.join(os.tmpdir(), 'plan-tools-test-')));
});

function makeTools(willys: WillysClient) {
	return createPlanTools({ willys, plans });
}

async function run(willys: WillysClient, name: string, params: unknown) {
	const tool = makeTools(willys).find((t) => t.name === name);
	return tool!.execute('id', params as never, undefined, undefined, {} as never);
}

describe('createPlanTools', () => {
	it('returns three tools with the exact expected names', () => {
		const tools = makeTools(mockClient());
		expect(tools.map((t) => t.name)).toEqual(EXPECTED_NAMES);
	});

	it('plan_record_cart snapshots the live cart into the week plan', async () => {
		await plans.save(createWeeklyPlan(LIST, '2026-W29'));

		const result = await run(mockClient({ getCart: async () => CART }), 'plan_record_cart', {
			week: '2026-W29'
		});

		const plan = result.details as WeeklyPlan;
		expect(plan.weekId).toBe('2026-W29');
		expect(plan.willysCart?.lines[0].productId).toBe('101233933_ST');
		expect(plan.willysCart?.recordedAt).toBeTypeOf('string');
		expect(plan.willysCart?.subtotal.formatted).toBe('10,00 kr');

		const loaded = await plans.load('2026-W29');
		expect(loaded?.willysCart?.lines).toHaveLength(1);
	});

	it('plan_record_cart defaults to the current week', async () => {
		await plans.save(createWeeklyPlan(LIST, currentWeekId()));

		const result = await run(mockClient({ getCart: async () => CART }), 'plan_record_cart', {});

		expect((result.details as WeeklyPlan).weekId).toBe(currentWeekId());
	});

	it('plan_record_cart fails clearly when the week has no plan', async () => {
		const result = await run(mockClient({ getCart: async () => CART }), 'plan_record_cart', {
			week: '2026-W30'
		});

		const text = (result.content[0] as { text: string }).text;
		expect(text).toContain('No plan for week 2026-W30');
		expect(text.startsWith('Plan tool error:')).toBe(false);
	});

	it('plan_record_cart refuses to record an empty cart', async () => {
		await plans.save(createWeeklyPlan(LIST, '2026-W29'));

		const result = await run(mockClient({ getCart: async () => EMPTY_CART }), 'plan_record_cart', {
			week: '2026-W29'
		});

		const text = (result.content[0] as { text: string }).text;
		expect(text).toContain('empty');
		const loaded = await plans.load('2026-W29');
		expect(loaded?.willysCart).toBeNull();
	});

	it('plan_record_cart surfaces WillysConfigError verbatim', async () => {
		await plans.save(createWeeklyPlan(LIST, '2026-W29'));

		const result = await run(
			mockClient({
				getCart: async () => {
					throw new WillysConfigError();
				}
			}),
			'plan_record_cart',
			{ week: '2026-W29' }
		);

		const text = (result.content[0] as { text: string }).text;
		expect(text).toContain('WILLYS_USERNAME');
		expect(text.startsWith('Plan tool error:')).toBe(false);
	});

	it('plan_get returns the plan and the available weeks', async () => {
		await plans.save(createWeeklyPlan(LIST, '2026-W29'));

		const result = await run(mockClient(), 'plan_get', { week: '2026-W29' });

		const details = result.details as {
			weekId: string;
			plan: WeeklyPlan | null;
			availableWeeks: string[];
		};
		expect(details.weekId).toBe('2026-W29');
		expect(details.plan?.recipes[0].name).toBe('Varmrökt lax');
		expect(details.availableWeeks).toEqual(['2026-W29']);
	});

	it('plan_get returns an ok result with plan: null for an unplanned week', async () => {
		const result = await run(mockClient(), 'plan_get', { week: '2026-W30' });

		const details = result.details as { plan: WeeklyPlan | null; availableWeeks: string[] };
		expect(details.plan).toBeNull();
		expect(details.availableWeeks).toEqual([]);
	});

	it('plan_delete removes the plan and reports the remaining weeks', async () => {
		await plans.save(createWeeklyPlan(LIST, '2026-W29'));
		await plans.save(createWeeklyPlan(LIST, '2026-W30'));

		const result = await run(mockClient(), 'plan_delete', { week: '2026-W29' });

		const details = result.details as {
			weekId: string;
			deleted: boolean;
			availableWeeks: string[];
		};
		expect(details).toEqual({ weekId: '2026-W29', deleted: true, availableWeeks: ['2026-W30'] });
		await expect(plans.load('2026-W29')).resolves.toBeNull();
	});

	it('plan_delete reports deleted: false for a week without a plan', async () => {
		const result = await run(mockClient(), 'plan_delete', { week: '2026-W30' });

		expect(result.details).toEqual({ weekId: '2026-W30', deleted: false, availableWeeks: [] });
	});

	it('plan_delete surfaces PlanStoreError verbatim for an invalid week id', async () => {
		const result = await run(mockClient(), 'plan_delete', { week: '2026-W99' });

		const text = (result.content[0] as { text: string }).text;
		expect(text).toContain('Invalid week id');
		expect(text.startsWith('Plan tool error:')).toBe(false);
	});
});

import { describe, expect, it } from 'vitest';
import { buildCoverageDiff } from './coverage';
import type { WeeklyPlan, WillysCartSnapshot } from './types';
import type { Money, NormalizedCartLine } from '../server/willys/types';

function money(amount: number): Money {
	return { amount, formatted: `${amount},00 kr`, currency: 'SEK' };
}

function line(productId: string, name: string): NormalizedCartLine {
	return {
		productId,
		name,
		brand: null,
		quantity: 1,
		pickUnit: 'pieces',
		unitPrice: money(10),
		lineTotal: money(10),
		categories: [],
		displaySize: null,
		imageUrl: null
	};
}

function item(name: string) {
	return { name, amounts: [], toTaste: false, recipeIds: [1] };
}

function plan(overrides: {
	items?: string[];
	pantryStaples?: string[];
	snapshot?: Partial<WillysCartSnapshot> | null;
}): WeeklyPlan {
	const snapshot = overrides.snapshot;
	return {
		version: 1,
		weekId: '2026-W30',
		servings: 4,
		status: 'new',
		recipes: [{ recipeId: 1, name: 'Lax' }],
		shoppingList: {
			items: (overrides.items ?? []).map(item),
			pantryStaples: (overrides.pantryStaples ?? []).map(item)
		},
		willysCart:
			snapshot === null || snapshot === undefined
				? null
				: {
						recordedAt: '2026-07-19T11:00:00.000Z',
						store: { id: '2583' },
						itemCount: 1,
						totalQuantity: 1,
						lines: [],
						subtotal: money(10),
						coverage: [],
						...snapshot
					},
		generatedAt: '2026-07-19T10:00:00.000Z',
		updatedAt: '2026-07-19T11:00:00.000Z'
	};
}

describe('buildCoverageDiff', () => {
	it('reports unknown when the week has no recorded cart', () => {
		const diff = buildCoverageDiff(plan({ items: ['potatis'], snapshot: null }));

		expect(diff).toEqual({ hasCoverage: false, matched: [], unmatched: [], extra: [] });
	});

	it('reports unknown — not "nothing matched" — when a snapshot has no coverage', () => {
		const diff = buildCoverageDiff(
			plan({ items: ['potatis'], snapshot: { lines: [line('1_ST', 'Potatis')], coverage: [] } })
		);

		expect(diff.hasCoverage).toBe(false);
		expect(diff.unmatched).toEqual([]);
	});

	it('matches every item when coverage names them all', () => {
		const diff = buildCoverageDiff(
			plan({
				items: ['potatis', 'tomat'],
				snapshot: {
					lines: [line('1_ST', 'Potatis'), line('2_ST', 'Tomat')],
					coverage: [
						{ productId: '1_ST', covers: ['potatis'] },
						{ productId: '2_ST', covers: ['tomat'] }
					]
				}
			})
		);

		expect(diff.hasCoverage).toBe(true);
		expect(diff.matched).toEqual([
			{ name: 'potatis', productIds: ['1_ST'] },
			{ name: 'tomat', productIds: ['2_ST'] }
		]);
		expect(diff.unmatched).toEqual([]);
		expect(diff.extra).toEqual([]);
	});

	it('flags an item no product covers — the failure this exists to catch', () => {
		const diff = buildCoverageDiff(
			plan({
				items: ['potatis', 'dijonsenap'],
				snapshot: {
					lines: [line('1_ST', 'Potatis')],
					coverage: [{ productId: '1_ST', covers: ['potatis'] }]
				}
			})
		);

		expect(diff.unmatched).toEqual(['dijonsenap']);
	});

	it('lets one product cover several items', () => {
		const diff = buildCoverageDiff(
			plan({
				items: ['tomat', 'gurka'],
				snapshot: {
					lines: [line('1_ST', 'Salladspaket')],
					coverage: [{ productId: '1_ST', covers: ['tomat', 'gurka'] }]
				}
			})
		);

		expect(diff.matched).toEqual([
			{ name: 'tomat', productIds: ['1_ST'] },
			{ name: 'gurka', productIds: ['1_ST'] }
		]);
		expect(diff.extra).toEqual([]);
	});

	it('lets several products cover one item', () => {
		const diff = buildCoverageDiff(
			plan({
				items: ['potatis'],
				snapshot: {
					lines: [line('1_ST', 'Potatis'), line('2_ST', 'Potatis fast')],
					coverage: [
						{ productId: '1_ST', covers: ['potatis'] },
						{ productId: '2_ST', covers: ['potatis'] }
					]
				}
			})
		);

		expect(diff.matched).toEqual([{ name: 'potatis', productIds: ['1_ST', '2_ST'] }]);
	});

	it('ignores coverage for a product no longer in the cart, so its items stay unmatched', () => {
		const diff = buildCoverageDiff(
			plan({
				items: ['potatis'],
				snapshot: {
					lines: [],
					coverage: [{ productId: 'removed_ST', covers: ['potatis'] }]
				}
			})
		);

		expect(diff.hasCoverage).toBe(true);
		expect(diff.unmatched).toEqual(['potatis']);
		expect(diff.matched).toEqual([]);
	});

	it('ignores coverage naming an item that is not on the list', () => {
		const diff = buildCoverageDiff(
			plan({
				items: ['potatis'],
				snapshot: {
					lines: [line('1_ST', 'Potatis'), line('2_ST', 'Kaffe')],
					coverage: [
						{ productId: '1_ST', covers: ['potatis'] },
						{ productId: '2_ST', covers: ['kaffe'] }
					]
				}
			})
		);

		expect(diff.unmatched).toEqual([]);
		expect(diff.matched).toEqual([{ name: 'potatis', productIds: ['1_ST'] }]);
		// The product IS referenced by coverage, so it is not an unexplained extra.
		expect(diff.extra).toEqual([]);
	});

	it('lists cart products no coverage entry mentions as extras', () => {
		const diff = buildCoverageDiff(
			plan({
				items: ['potatis'],
				snapshot: {
					lines: [line('1_ST', 'Potatis'), line('9_ST', 'Kaffe')],
					coverage: [{ productId: '1_ST', covers: ['potatis'] }]
				}
			})
		);

		expect(diff.extra.map((l) => l.productId)).toEqual(['9_ST']);
	});

	it('never asks the user to buy pantry staples', () => {
		const diff = buildCoverageDiff(
			plan({
				items: ['potatis'],
				pantryStaples: ['salt'],
				snapshot: {
					lines: [line('1_ST', 'Potatis')],
					coverage: [{ productId: '1_ST', covers: ['potatis'] }]
				}
			})
		);

		expect(diff.unmatched).toEqual([]);
		expect(diff.matched.map((m) => m.name)).toEqual(['potatis']);
	});

	it('compares names case- and whitespace-insensitively', () => {
		const diff = buildCoverageDiff(
			plan({
				items: ['Dijonsenap'],
				snapshot: {
					lines: [line('1_ST', 'Senap')],
					coverage: [{ productId: '1_ST', covers: ['  dijonsenap '] }]
				}
			})
		);

		expect(diff.unmatched).toEqual([]);
		expect(diff.matched).toEqual([{ name: 'Dijonsenap', productIds: ['1_ST'] }]);
	});
});

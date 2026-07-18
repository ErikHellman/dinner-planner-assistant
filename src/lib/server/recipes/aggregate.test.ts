import { describe, expect, it } from 'vitest';
import { aggregateIngredients, RecipeAggregateError } from './aggregate';
import type { RecipeIngredient, RecipeIngredientList } from './types';

function ing(
	name: string,
	amount: number | null,
	unit: string | null,
	isBasis = false
): RecipeIngredient {
	return {
		section: null,
		name,
		amount,
		unit,
		raw: `${amount ?? ''} ${unit ?? ''} ${name}`.trim(),
		isBasis
	};
}

function list(
	recipeId: number,
	name: string,
	ingredients: RecipeIngredient[]
): RecipeIngredientList {
	return { recipeId, name, servings: 2, ingredients };
}

describe('aggregateIngredients', () => {
	it('merges the same ingredient across recipes case/diacritic-insensitively, keeping the first-seen spelling', () => {
		const { items } = aggregateIngredients(
			[list(1, 'A', [ing('Gräddfil', 150, 'g')]), list(2, 'B', [ing('gräddfil', 100, 'g')])],
			2
		);
		expect(items).toEqual([
			{
				name: 'Gräddfil',
				amounts: [{ value: 250, unit: 'g', display: '250 g' }],
				toTaste: false,
				recipeIds: [1, 2]
			}
		]);
	});

	it('sums volume units (krm/tsk/msk/dl) into one ml bucket', () => {
		const { items } = aggregateIngredients(
			[
				list(1, 'A', [ing('olja', 2, 'tsk'), ing('olja', 5, 'krm')]),
				list(2, 'B', [ing('olja', 1, 'msk')])
			],
			2
		);
		// 10 + 5 + 15 = 30 ml -> 2 msk
		expect(items[0].amounts).toEqual([{ value: 30, unit: 'ml', display: '2 msk' }]);
	});

	it('renders volume in the largest unit giving a multiple of 0.25', () => {
		const render = (amount: number, unit: string) =>
			aggregateIngredients([list(1, 'A', [ing('x', amount, unit)])], 2).items[0].amounts[0].display;
		expect(render(0.5, 'dl')).toBe('0.5 dl'); // 50 ml
		expect(render(3, 'msk')).toBe('3 msk'); // 45 ml: 0.45 dl fails, 3 msk wins
		expect(render(7, 'krm')).toBe('7 krm'); // 7 ml: no dl/msk/tsk multiple
		expect(render(0.1, 'krm')).toBe('0.1 ml'); // nothing fits -> ml fallback
		expect(render(4.95, 'tsk')).toBe('24.75 krm'); // 24.75 ml — near 0.25 dl, must not round up
		expect(render(49.5, 'ml')).toBe('49.5 krm'); // near 0.5 dl, must not round up
	});

	it('keeps incompatible units as separate amounts under one ingredient, sorted by unit', () => {
		const { items } = aggregateIngredients(
			[
				list(1, 'A', [ing('äggnudlar', 200, 'g')]),
				list(2, 'B', [ing('äggnudlar', 0.5, 'förp'), ing('äggnudlar', 100, 'g')])
			],
			2
		);
		expect(items[0].amounts).toEqual([
			{ value: 0.5, unit: 'förp', display: '0.5 förp' },
			{ value: 300, unit: 'g', display: '300 g' }
		]);
	});

	it('puts all-basis ingredients in pantryStaples and mixed basis/non-basis in items', () => {
		const { items, pantryStaples } = aggregateIngredients(
			[
				list(1, 'A', [ing('salt', 1, 'tsk', true), ing('ägg', 2, 'st', true)]),
				list(2, 'B', [ing('salt', 2, 'krm', true), ing('ägg', 1, 'st', false)])
			],
			2
		);
		expect(pantryStaples.map((i) => i.name)).toEqual(['salt']);
		expect(items.map((i) => i.name)).toEqual(['ägg']);
		expect(items[0].amounts).toEqual([{ value: 3, unit: 'st', display: '3 st' }]);
	});

	it('sets toTaste for null amounts without dropping numeric ones', () => {
		const { pantryStaples } = aggregateIngredients(
			[
				list(1, 'A', [ing('salt', 1, 'tsk', true), ing('peppar', null, null, true)]),
				list(2, 'B', [ing('salt', null, null, true)])
			],
			2
		);
		const salt = pantryStaples.find((i) => i.name === 'salt');
		const peppar = pantryStaples.find((i) => i.name === 'peppar');
		expect(salt).toMatchObject({
			toTaste: true,
			amounts: [{ value: 5, unit: 'ml', display: '1 tsk' }]
		});
		expect(peppar).toMatchObject({ toTaste: true, amounts: [] });
	});

	it('scales amounts by servings/2, including odd servings', () => {
		const lists = [list(1, 'A', [ing('lök', 1, 'st'), ing('mjöl', 100, 'g')])];
		const four = aggregateIngredients(lists, 4).items;
		expect(four.map((i) => i.amounts[0])).toEqual([
			{ value: 2, unit: 'st', display: '2 st' },
			{ value: 200, unit: 'g', display: '200 g' }
		]);
		const three = aggregateIngredients(lists, 3).items;
		expect(three.map((i) => i.amounts[0])).toEqual([
			{ value: 1.5, unit: 'st', display: '1.5 st' },
			{ value: 150, unit: 'g', display: '150 g' }
		]);
	});

	it('rejects non-integer or < 1 servings', () => {
		for (const bad of [0, -2, 1.5, NaN]) {
			expect(() => aggregateIngredients([], bad)).toThrow(RecipeAggregateError);
		}
	});

	it('counts duplicate recipes double but lists the recipeId once', () => {
		const twice = [list(7, 'A', [ing('ris', 150, 'g')]), list(7, 'A', [ing('ris', 150, 'g')])];
		const { items } = aggregateIngredients(twice, 2);
		expect(items[0].amounts[0].value).toBe(300);
		expect(items[0].recipeIds).toEqual([7]);
	});

	it('sorts items with Swedish collation', () => {
		const { items } = aggregateIngredients(
			[list(1, 'A', [ing('Örter', 1, 'st'), ing('Citron', 1, 'st'), ing('Ägg', 1, 'st')])],
			2
		);
		expect(items.map((i) => i.name)).toEqual(['Citron', 'Ägg', 'Örter']);
	});

	it('rounds sums to 2 decimals', () => {
		const { items } = aggregateIngredients(
			[list(1, 'A', [ing('fetaost', 1.1, 'g'), ing('fetaost', 2.2, 'g')])],
			2
		);
		expect(items[0].amounts[0].value).toBe(3.3);
	});

	it('handles a null unit as its own bucket with a bare-number display', () => {
		const { items } = aggregateIngredients([list(1, 'A', [ing('ägg', 2, null)])], 2);
		expect(items[0].amounts).toEqual([{ value: 2, unit: null, display: '2' }]);
	});
});

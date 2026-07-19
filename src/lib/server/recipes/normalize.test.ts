import { describe, expect, it } from 'vitest';
import recipeFixture from './fixtures/recipe-and-steps.json';
import {
	decodeHtmlText,
	foldText,
	normalizeRecipe,
	parseAmount,
	RecipeNormalizeError,
	slugify
} from './normalize';
import type { RawRecipeAndSteps } from './types';

const fixture = recipeFixture as RawRecipeAndSteps;
const OPTS = {
	images: { large: 'images/125524-large.jpg', small: 'images/125524-small.jpg' },
	harvestedAt: '2026-07-18T12:00:00.000Z'
};

describe('foldText / slugify', () => {
	it('lowercases and strips diacritics', () => {
		expect(foldText('Kalorisnål')).toBe('kalorisnal');
		expect(foldText('VARMRÖKT')).toBe('varmrokt');
	});

	it('slugifies recipe names', () => {
		expect(slugify('Varmrökt lax med äppelsallad och dillsås')).toBe(
			'varmrokt-lax-med-appelsallad-och-dillsas'
		);
		expect(slugify('!!!')).toBe('recept');
	});
});

describe('decodeHtmlText', () => {
	it('strips tags and decodes entities', () => {
		expect(decodeHtmlText('<strong>Dills&aring;s: </strong>Blanda gr&auml;ddfil &amp; dill.')).toBe(
			'Dillsås: Blanda gräddfil & dill.'
		);
	});

	it('decodes numeric entities and collapses whitespace', () => {
		expect(decodeHtmlText('a&#229;  b&#xE4;\n c')).toBe('aå bä c');
	});

	it('keeps bare angle brackets in prose (only strips known formatting tags)', () => {
		expect(decodeHtmlText('5 < 10 men 10 > 5')).toBe('5 < 10 men 10 > 5');
	});

	it('decodes the entities the harvested corpus actually contains', () => {
		expect(decodeHtmlText('Värm ugnen till 225&deg;C')).toBe('Värm ugnen till 225°C');
		expect(decodeHtmlText('cr&egrave;me fra&icirc;che')).toBe('crème fraîche');
		expect(decodeHtmlText('&acirc; &ntilde; 5&ndash;10 min')).toBe('â ñ 5–10 min');
	});

	it('leaves unknown named entities literal', () => {
		expect(decodeHtmlText('&frac12; msk')).toBe('&frac12; msk');
	});
});

describe('parseAmount', () => {
	it.each([
		['150', 150],
		['1,5', 1.5],
		['½', 0.5],
		['1½', 1.5],
		['2½', 2.5],
		[2, 2],
		['0', null],
		['null', null],
		[null, null],
		[undefined, null],
		['efter smak', null]
	])('parses %j to %j', (input, expected) => {
		expect(parseAmount(input as string | number | null | undefined)).toBe(expected);
	});
});

describe('normalizeRecipe', () => {
	const doc = normalizeRecipe(fixture, OPTS);

	it('selects the 2-portion variant regardless of array order', () => {
		expect(doc.servings).toBe(2);
		expect(doc.ingredients).toHaveLength(5);
	});

	it('throws a typed error when no 2-portion variant exists', () => {
		const broken: RawRecipeAndSteps = {
			...fixture,
			instructions: { portions: [{ size: '4' }] }
		};
		expect(() => normalizeRecipe(broken, OPTS)).toThrow(RecipeNormalizeError);
		expect(() => normalizeRecipe(broken, OPTS)).toThrow(/no 2-portion/);
	});

	it('keeps only category-like taxonomies, deduplicated in order', () => {
		expect(doc.categories).toEqual([
			'Fisk och skaldjur',
			'Kalorisnål',
			'Utan laktos',
			'Low calorie',
			'Mediterranean'
		]);
	});

	it('keeps only visible allergies', () => {
		expect(doc.allergies).toEqual(['Fisk', 'Mjölk']);
	});

	it('sorts ingredients within a section by their order field', () => {
		const shuffled: RawRecipeAndSteps = {
			...fixture,
			instructions: {
				portions: [
					{
						size: '2',
						ingredientSections: [
							{
								sectionTitle: null,
								ingredients: [
									{ order: '1', name: 'dill', amount: '1', ingredientAmountType: 'kruka' },
									{ order: '0', name: 'lax', amount: '250', ingredientAmountType: 'g' }
								]
							}
						]
					}
				]
			}
		};
		const sorted = normalizeRecipe(shuffled, OPTS);
		expect(sorted.ingredients.map((i) => i.name)).toEqual(['lax', 'dill']);
	});

	it('normalizes a bare 2-portion variant to empty arrays', () => {
		const bare: RawRecipeAndSteps = {
			...fixture,
			instructions: { portions: [{ size: '2' }] }
		};
		const empty = normalizeRecipe(bare, OPTS);
		expect(empty.ingredients).toEqual([]);
		expect(empty.instructions).toEqual([]);
		expect(empty.allergies).toEqual([]);
	});

	it('normalizes ingredients with section, parsed amount, unit, raw, and isBasis', () => {
		expect(doc.ingredients[0]).toEqual({
			section: 'Dillsås',
			name: 'gräddfil',
			amount: 150,
			unit: 'g',
			raw: '150 g gräddfil',
			isBasis: false
		});
		expect(doc.ingredients[1]).toEqual({
			section: 'Dillsås',
			name: 'salt',
			amount: null,
			unit: 'krm',
			raw: 'krm salt',
			isBasis: true
		});
		expect(doc.ingredients[2]).toEqual({
			section: null,
			name: 'gurka',
			amount: 0.5,
			unit: 'st',
			raw: '½ st gurka',
			isBasis: false
		});
		expect(doc.ingredients[4].amount).toBeNull(); // "0" means "to taste"
		expect(doc.ingredients[4].raw).toBe('0 krm svartpeppar');
	});

	it('flattens, decodes, and renumbers instructions', () => {
		expect(doc.instructions).toEqual([
			{ step: 1, section: null, text: 'Koka potatis i lättsaltat vatten.' },
			{ step: 2, section: null, text: 'Dillsås: Blanda gräddfil & dill.' }
		]);
	});

	it('extracts nutrition, CO2, cooking time, and rating', () => {
		expect(doc.nutritionPerServing).toEqual({
			energyKcal: 556,
			protein: 29.53,
			carbs: 53.42,
			fat: 24.96
		});
		expect(doc.co2eKgPerServing).toBe(1.05);
		expect(doc.cookingTime).toEqual({ min: 15, max: 20 });
		expect(doc.rating).toEqual({ average: 4.06, count: 584 });
	});

	it('builds the source URL from a slugified name', () => {
		expect(doc.source).toEqual({
			url: 'https://www.linasmatkasse.se/recept/125524/varmrokt-lax-med-appelsallad-och-dillsas',
			harvestedAt: '2026-07-18T12:00:00.000Z'
		});
	});

	it('passes image paths through', () => {
		expect(doc.images).toEqual({
			large: 'images/125524-large.jpg',
			small: 'images/125524-small.jpg'
		});
	});
});

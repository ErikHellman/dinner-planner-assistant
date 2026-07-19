import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { recipeImageUrl, resolveRecipeImagePath } from './images';
import type { RecipeDoc } from './types';

const DIR = '/data/recipes';

const DOC = {
	recipeId: 100575,
	images: { large: 'images/100575-large.jpg', small: 'images/100575-small.jpg' },
	source: { url: 'https://example.test', harvestedAt: '2026-07-18T20:32:30.612Z' }
} as RecipeDoc;

describe('recipeImageUrl', () => {
	it('builds an API URL with a harvest-stamped cache buster', () => {
		expect(recipeImageUrl(DOC, 'small')).toBe(
			`/api/recipes/100575/image?size=small&v=${Date.parse('2026-07-18T20:32:30.612Z')}`
		);
	});

	it('returns null when the doc has no image of that size', () => {
		const noImages = { ...DOC, images: { large: null, small: null } } as RecipeDoc;
		expect(recipeImageUrl(noImages, 'large')).toBeNull();
	});
});

describe('resolveRecipeImagePath', () => {
	it('resolves a valid id + size to the image file path', () => {
		expect(resolveRecipeImagePath(DIR, '100575', 'large')).toBe(
			path.resolve(DIR, 'images', '100575-large.jpg')
		);
		expect(resolveRecipeImagePath(DIR, '1', 'small')).toBe(
			path.resolve(DIR, 'images', '1-small.jpg')
		);
	});

	it('rejects non-numeric and traversal-shaped ids', () => {
		expect(resolveRecipeImagePath(DIR, '../../etc/passwd', 'large')).toBeNull();
		expect(resolveRecipeImagePath(DIR, '100575/..', 'large')).toBeNull();
		expect(resolveRecipeImagePath(DIR, '100575-large.jpg', 'large')).toBeNull();
		expect(resolveRecipeImagePath(DIR, '', 'large')).toBeNull();
		expect(resolveRecipeImagePath(DIR, 'abc', 'large')).toBeNull();
		expect(resolveRecipeImagePath(DIR, '12345678901', 'large')).toBeNull(); // absurd length
	});

	it('rejects unknown sizes', () => {
		expect(resolveRecipeImagePath(DIR, '100575', 'huge')).toBeNull();
		expect(resolveRecipeImagePath(DIR, '100575', '../large')).toBeNull();
		expect(resolveRecipeImagePath(DIR, '100575', null)).toBeNull();
	});
});

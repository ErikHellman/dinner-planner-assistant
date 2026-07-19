import { describe, expect, it } from 'vitest';
import { activityLabel } from './activity';

describe('activityLabel', () => {
	it('maps known tool names to Swedish activity labels', () => {
		expect(activityLabel('recipe_search')).toBe('Söker recept…');
		expect(activityLabel('recipe_aggregate')).toBe('Bygger inköpslista…');
		expect(activityLabel('willys_search')).toBe('Söker i Willys sortiment…');
		expect(activityLabel('willys_cart_add')).toBe('Lägger i varukorgen…');
		expect(activityLabel('plan_record_cart')).toBe('Sparar veckans plan…');
	});

	it('falls back to a generic label for unknown tools', () => {
		expect(activityLabel('mystery_tool')).toBe('Arbetar…');
	});
});

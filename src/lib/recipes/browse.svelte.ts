import { apiFetch, messageFor } from '$lib/api/client';
import { foldText } from '$lib/utils/text';
import type { BrowseRecipe } from './types';

/** Client cache of the recipe list for the browse grid. Loaded once per app
 * lifetime (the database only changes on re-harvest); filter text persists
 * across tab navigation. */
export class BrowseStore {
	recipes = $state.raw<BrowseRecipe[]>([]);
	filter = $state('');
	status = $state<'idle' | 'loading'>('idle');
	error = $state<string | null>(null);
	#loaded = false;

	/** Diacritic-insensitive match on name, main ingredient and categories. */
	get filtered(): BrowseRecipe[] {
		const query = foldText(this.filter.trim());
		if (!query) return this.recipes;
		return this.recipes.filter(
			(recipe) =>
				foldText(recipe.name).includes(query) ||
				(recipe.mainIngredient !== null && foldText(recipe.mainIngredient).includes(query)) ||
				recipe.categories.some((category) => foldText(category).includes(query))
		);
	}

	async load(): Promise<void> {
		if (this.#loaded || this.status === 'loading') return;
		this.status = 'loading';
		this.error = null;
		try {
			const { recipes } = await apiFetch<{ recipes: BrowseRecipe[] }>('/api/recipes');
			this.recipes = recipes;
			this.#loaded = true;
		} catch (err) {
			this.error = messageFor(err);
		} finally {
			this.status = 'idle';
		}
	}
}

/** Module singleton: the list and filter survive tab navigation. */
export const browseStore = new BrowseStore();

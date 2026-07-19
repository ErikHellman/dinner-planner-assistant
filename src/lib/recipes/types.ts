// Type-only imports from $lib/server are erased at build time.
import type { RecipeDoc, RecipeSearchHit } from '../server/recipes/types';

/** One card in the browse grid, served by GET /api/recipes. */
export interface BrowseRecipe extends RecipeSearchHit {
	headline: string | null;
	imageSmall: string | null;
}

/** Full detail document served by GET /api/recipes/[id]: the stored doc with
 * serve-time entity decoding plus browser image URLs. */
export type RecipeDetails = RecipeDoc & {
	imageLarge: string | null;
	imageSmall: string | null;
};

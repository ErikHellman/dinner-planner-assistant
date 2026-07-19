import path from 'node:path';
import type { RecipeDoc } from './types';

/** Browser URL for a recipe image, or null when the doc lacks that size.
 * The ?v= cache buster (harvest timestamp) lets the endpoint serve immutable
 * cache headers while re-harvests still refresh stale browser caches. */
export function recipeImageUrl(doc: RecipeDoc, size: 'large' | 'small'): string | null {
	if (!doc.images[size]) return null;
	const version = Date.parse(doc.source.harvestedAt) || 0;
	return `/api/recipes/${doc.recipeId}/image?size=${size}&v=${version}`;
}

/**
 * Path of a recipe image inside <recipesDir>/images, or null when the raw id
 * or size is not acceptable. The filename is CONSTRUCTED from validated parts
 * (never joined from raw input); the containment check is belt and braces.
 */
export function resolveRecipeImagePath(
	recipesDir: string,
	idRaw: string,
	sizeRaw: string | null
): string | null {
	if (!/^\d{1,10}$/.test(idRaw)) return null;
	if (sizeRaw !== 'large' && sizeRaw !== 'small') return null;
	const imagesDir = path.resolve(recipesDir, 'images');
	const resolved = path.resolve(imagesDir, `${idRaw}-${sizeRaw}.jpg`);
	if (!resolved.startsWith(imagesDir + path.sep)) return null;
	return resolved;
}

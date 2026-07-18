import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { foldText } from './normalize';
import type { RecipeDoc, RecipeIngredientList, RecipeSearchHit } from './types';

export class RecipeQueryError extends Error {
	constructor(message: string, options?: ErrorOptions) {
		super(message, options);
		this.name = 'RecipeQueryError';
	}
}

export interface RecipeSearchFilters {
	query?: string;
	category?: string;
	maxTimeMinutes?: number;
	maxKcal?: number;
}

export function defaultRecipesDir(): string {
	return path.resolve(process.cwd(), 'data/recipes');
}

/** Read-only queries over the harvested JSON documents in a data/recipes directory. */
export class RecipeStore {
	constructor(private readonly dir: string) {}

	async loadAll(): Promise<RecipeDoc[]> {
		let files: string[];
		try {
			files = await readdir(this.dir);
		} catch {
			throw new RecipeQueryError(
				`Recipe database not found at ${this.dir} — run "npm run recipes -- harvest" first`
			);
		}
		const docs: RecipeDoc[] = [];
		for (const file of files.filter((f) => /^\d+\.json$/.test(f))) {
			let doc: RecipeDoc;
			try {
				doc = JSON.parse(await readFile(path.join(this.dir, file), 'utf8')) as RecipeDoc;
			} catch (err) {
				throw new RecipeQueryError(`Failed to read recipe document ${file}`, { cause: err });
			}
			if (typeof doc.recipeId !== 'number' || typeof doc.name !== 'string') {
				throw new RecipeQueryError(`Invalid recipe document ${file}: missing recipeId or name`);
			}
			docs.push(doc);
		}
		if (docs.length === 0) {
			throw new RecipeQueryError(
				`No recipes found in ${this.dir} — run "npm run recipes -- harvest" first`
			);
		}
		return docs;
	}

	async search(filters: RecipeSearchFilters = {}): Promise<RecipeSearchHit[]> {
		const docs = await this.loadAll();
		const query = filters.query ? foldText(filters.query) : null;
		const category = filters.category ? foldText(filters.category) : null;
		return docs
			.filter((doc) => {
				if (query) {
					const inName = foldText(doc.name).includes(query);
					const inIngredients = doc.ingredients.some((i) => foldText(i.name).includes(query));
					if (!inName && !inIngredients) return false;
				}
				if (category) {
					const haystack = [...doc.categories, doc.mainIngredient ?? ''];
					if (!haystack.some((c) => foldText(c).includes(category))) return false;
				}
				// Recipes with unknown time/kcal are excluded when the corresponding filter is used.
				if (
					filters.maxTimeMinutes !== undefined &&
					(doc.cookingTime.max ?? Infinity) > filters.maxTimeMinutes
				) {
					return false;
				}
				if (
					filters.maxKcal !== undefined &&
					(doc.nutritionPerServing?.energyKcal ?? Infinity) > filters.maxKcal
				) {
					return false;
				}
				return true;
			})
			.map((doc) => ({
				recipeId: doc.recipeId,
				name: doc.name,
				mainIngredient: doc.mainIngredient,
				categories: doc.categories,
				cookingTime: doc.cookingTime,
				energyKcalPerServing: doc.nutritionPerServing?.energyKcal ?? null,
				rating: doc.rating
			}))
			.sort((a, b) => a.name.localeCompare(b.name, 'sv') || a.recipeId - b.recipeId);
	}

	async get(recipeId: number): Promise<RecipeDoc> {
		if (!Number.isInteger(recipeId) || recipeId <= 0) {
			throw new RecipeQueryError(`Recipe ${recipeId} not found in the local database`);
		}
		const file = path.join(this.dir, `${recipeId}.json`);
		try {
			return JSON.parse(await readFile(file, 'utf8')) as RecipeDoc;
		} catch (err) {
			if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
				throw new RecipeQueryError(`Recipe ${recipeId} not found in the local database`);
			}
			throw new RecipeQueryError(`Recipe ${recipeId} could not be read`, { cause: err });
		}
	}

	// Deliberately all-or-nothing: for shopping-list building, a hard failure naming the
	// bad id beats a silently incomplete ingredient list.
	async ingredients(recipeIds: number[]): Promise<RecipeIngredientList[]> {
		return Promise.all(
			recipeIds.map(async (id) => {
				const doc = await this.get(id);
				return {
					recipeId: doc.recipeId,
					name: doc.name,
					servings: doc.servings,
					ingredients: doc.ingredients
				};
			})
		);
	}
}

// ---------- Our normalized document ----------

export interface RecipeIngredient {
	/** Ingredient group heading from the recipe, e.g. "Dillsås"; null when ungrouped. */
	section: string | null;
	name: string;
	/** Parsed numeric amount for 2 servings; null when missing/unparseable ("efter smak"). */
	amount: number | null;
	/** Unit exactly as published (g, st, tsk, msk, krm, ml, påse, förp, …); null when absent. */
	unit: string | null;
	/** Human-readable original, e.g. "150 g gräddfil" — kept verbatim for future aggregation. */
	raw: string;
	/** Pantry staple (salt, oil, …) the user is assumed to have at home. */
	isBasis: boolean;
}

export interface RecipeInstruction {
	step: number;
	section: string | null;
	text: string;
}

export interface RecipeNutrition {
	energyKcal: number;
	protein: number | null;
	carbs: number | null;
	fat: number | null;
}

export interface RecipeDoc {
	recipeId: number;
	/** Stable across weekly re-issues of the same dish; dedupe key for the future. */
	mainRecipeId: number | null;
	name: string;
	headline: string | null;
	subheadline: string | null;
	description: string | null;
	chefTip: string | null;
	/** e.g. "Fisk", "Kött", "Vegetariskt" */
	mainIngredient: string | null;
	/** Always 2 — every document stores the native 2-portion variant. */
	servings: 2;
	cookingTime: { min: number | null; max: number | null };
	categories: string[];
	allergies: string[];
	nutritionPerServing: RecipeNutrition | null;
	co2eKgPerServing: number | null;
	rating: { average: number | null; count: number | null };
	ingredients: RecipeIngredient[];
	instructions: RecipeInstruction[];
	/** Paths relative to data/recipes/, e.g. "images/125524-large.jpg". */
	images: { large: string | null; small: string | null };
	source: { url: string; harvestedAt: string };
}

export interface RecipeSearchHit {
	recipeId: number;
	name: string;
	mainIngredient: string | null;
	categories: string[];
	cookingTime: { min: number | null; max: number | null };
	energyKcalPerServing: number | null;
	rating: { average: number | null; count: number | null };
}

export interface RecipeIngredientList {
	recipeId: number;
	name: string;
	servings: number;
	ingredients: RecipeIngredient[];
}

// ---------- Raw payloads from linasmatkasse.se (subset we consume) ----------

export interface RawImageUrls {
	urls?: { size?: string | null; url?: string | null }[] | null;
}

export interface RawTaxonomy {
	name?: string | null;
	type?: string | null;
}

export interface RawIngredient {
	order?: string | number | null;
	name?: string | null;
	amount?: string | number | null;
	ingredientAmountType?: string | null;
	isBasis?: boolean | null;
}

export interface RawIngredientSection {
	sectionTitle?: string | null;
	ingredients?: RawIngredient[] | null;
}

export interface RawStep {
	order?: number | null;
	step?: string | null;
}

export interface RawStepSection {
	sectionTitle?: string | null;
	steps?: RawStep[] | null;
}

export interface RawAllergy {
	name?: string | null;
	showAllergy?: boolean | null;
}

export interface RawPortion {
	size?: string | number | null;
	allergies?: RawAllergy[] | null;
	stepSections?: RawStepSection[] | null;
	ingredientSections?: RawIngredientSection[] | null;
	nutritionFacts?: {
		recipeNutritionPerPortion?: {
			carbs?: number | null;
			energyKcal?: number | null;
			fat?: number | null;
			protein?: number | null;
		} | null;
	} | null;
	co2eKgPerPortion?: number | string | null;
}

export interface RawRecipeAndSteps {
	recipeId?: number;
	mainRecipeId?: number | null;
	recipeName?: string | null;
	recipeNameHeadline?: string | null;
	recipeNameSubheadline?: string | null;
	recipeDescription?: string | null;
	chefTip?: string | null;
	mainIngredient?: string | null;
	cookingTimeMin?: string | number | null;
	cookingTimeMax?: string | number | null;
	averageRating?: number | null;
	numberOfRatings?: number | null;
	images?: RawImageUrls | null;
	taxonomies?: RawTaxonomy[] | null;
	instructions?: { portions?: RawPortion[] | null } | null;
}

export interface RawListingRecipe {
	recipeId?: number;
	recipeName?: string | null;
	cookingTimeMin?: string | null;
	cookingTimeMax?: string | null;
	images?: RawImageUrls | null;
}

export interface RawListingPage {
	page?: number;
	totalPages?: number;
	recipes?: RawListingRecipe[] | null;
}

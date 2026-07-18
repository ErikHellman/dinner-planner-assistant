import { recipeUrl } from './scrape';
import type {
	RawIngredient,
	RawRecipeAndSteps,
	RecipeDoc,
	RecipeIngredient,
	RecipeInstruction
} from './types';

export class RecipeNormalizeError extends Error {
	constructor(message: string, options?: ErrorOptions) {
		super(message, options);
		this.name = 'RecipeNormalizeError';
	}
}

/** Lowercase and strip diacritics: "Kalorisnål" -> "kalorisnal". */
export function foldText(text: string): string {
	return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

export function slugify(name: string): string {
	return (
		foldText(name)
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-+|-+$/g, '') || 'recept'
	);
}

const NAMED_ENTITIES: Record<string, string> = {
	amp: '&',
	lt: '<',
	gt: '>',
	quot: '"',
	apos: "'",
	nbsp: ' ',
	auml: 'ä',
	Auml: 'Ä',
	aring: 'å',
	Aring: 'Å',
	ouml: 'ö',
	Ouml: 'Ö',
	eacute: 'é',
	Eacute: 'É',
	uuml: 'ü',
	Uuml: 'Ü'
};

/** Strip tags, decode the entities Linas actually uses, collapse whitespace. */
export function decodeHtmlText(html: string): string {
	return html
		.replace(/<[^>]*>/g, '')
		.replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
		.replace(/&#x([0-9a-fA-F]+);/g, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
		.replace(/&([a-zA-Z]+);/g, (match, name: string) => NAMED_ENTITIES[name] ?? match)
		.replace(/\s+/g, ' ')
		.trim();
}

const FRACTIONS: Record<string, number> = {
	'¼': 0.25,
	'½': 0.5,
	'¾': 0.75,
	'⅓': 1 / 3,
	'⅔': 2 / 3
};

/** "150" -> 150, "1,5" -> 1.5, "½"/"1½" -> 0.5/1.5; "0", "null", null, junk -> null. */
export function parseAmount(value: string | number | null | undefined): number | null {
	if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? value : null;
	if (!value) return null;
	const s = value.trim();
	if (!s || s === 'null') return null;
	const frac = s.match(/^(\d+)?\s*([¼½¾⅓⅔])$/);
	if (frac) return (frac[1] ? parseInt(frac[1], 10) : 0) + FRACTIONS[frac[2]];
	const n = Number(s.replace(',', '.'));
	return Number.isFinite(n) && n > 0 ? n : null;
}

/** Taxonomy types that are meaningful categories (rest is internal planning noise). */
const CATEGORY_TYPES = new Set([
	'category_tag',
	'marketing_tag',
	'special_food_tag',
	'recipe',
	'onesub'
]);

function toNumber(value: string | number | null | undefined): number | null {
	if (value === null || value === undefined || value === '') return null;
	const n = Number(value);
	return Number.isFinite(n) ? n : null;
}

function normalizeIngredient(raw: RawIngredient, section: string | null): RecipeIngredient {
	const name = (raw.name ?? '').trim();
	const unit = (raw.ingredientAmountType ?? '').trim() || null;
	const amountText =
		typeof raw.amount === 'number' ? String(raw.amount) : (raw.amount ?? '').trim();
	const rawParts = [amountText && amountText !== 'null' ? amountText : null, unit, name];
	return {
		section,
		name,
		amount: parseAmount(raw.amount),
		unit,
		raw: rawParts.filter(Boolean).join(' '),
		isBasis: raw.isBasis === true
	};
}

export function normalizeRecipe(
	raw: RawRecipeAndSteps,
	opts: { images: { large: string | null; small: string | null }; harvestedAt: string }
): RecipeDoc {
	const recipeId = raw.recipeId;
	if (typeof recipeId !== 'number')
		throw new RecipeNormalizeError('Recipe payload has no recipeId');

	const portions = raw.instructions?.portions ?? [];
	const portion = portions.find((p) => String(p.size) === '2');
	if (!portion) throw new RecipeNormalizeError(`Recipe ${recipeId} has no 2-portion variant`);

	const name = (raw.recipeName ?? '').trim() || `Recept ${recipeId}`;

	const categories: string[] = [];
	for (const t of raw.taxonomies ?? []) {
		if (t?.name && t.type && CATEGORY_TYPES.has(t.type) && !categories.includes(t.name)) {
			categories.push(t.name);
		}
	}

	const allergies: string[] = [];
	for (const a of portion.allergies ?? []) {
		if (a?.name && a.showAllergy !== false && !allergies.includes(a.name)) allergies.push(a.name);
	}

	const ingredients: RecipeIngredient[] = [];
	for (const s of portion.ingredientSections ?? []) {
		for (const i of s.ingredients ?? []) {
			ingredients.push(normalizeIngredient(i, s.sectionTitle?.trim() || null));
		}
	}

	const instructions: RecipeInstruction[] = [];
	for (const s of portion.stepSections ?? []) {
		const steps = [...(s.steps ?? [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
		for (const st of steps) {
			const text = decodeHtmlText(st.step ?? '');
			if (text) {
				instructions.push({
					step: instructions.length + 1,
					section: s.sectionTitle?.trim() || null,
					text
				});
			}
		}
	}

	const nut = portion.nutritionFacts?.recipeNutritionPerPortion;

	return {
		recipeId,
		mainRecipeId: raw.mainRecipeId ?? null,
		name,
		headline: raw.recipeNameHeadline ?? null,
		subheadline: raw.recipeNameSubheadline ?? null,
		description: raw.recipeDescription ?? null,
		chefTip: raw.chefTip ?? null,
		mainIngredient: raw.mainIngredient ?? null,
		servings: 2,
		cookingTime: { min: toNumber(raw.cookingTimeMin), max: toNumber(raw.cookingTimeMax) },
		categories,
		allergies,
		nutritionPerServing:
			nut && typeof nut.energyKcal === 'number'
				? {
						energyKcal: nut.energyKcal,
						protein: nut.protein ?? null,
						carbs: nut.carbs ?? null,
						fat: nut.fat ?? null
					}
				: null,
		co2eKgPerServing: toNumber(portion.co2eKgPerPortion),
		rating: { average: raw.averageRating ?? null, count: raw.numberOfRatings ?? null },
		ingredients,
		instructions,
		images: opts.images,
		source: { url: recipeUrl(recipeId, slugify(name)), harvestedAt: opts.harvestedAt }
	};
}

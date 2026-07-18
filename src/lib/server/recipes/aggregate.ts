import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { writeFileAtomic } from './atomic-write';
import { foldText } from './normalize';
import type { RecipeStore } from './query';
import type { RecipeIngredientList } from './types';

export class RecipeAggregateError extends Error {
	constructor(message: string, options?: ErrorOptions) {
		super(message, options);
		this.name = 'RecipeAggregateError';
	}
}

export interface AggregatedAmount {
	/** Canonical machine value, e.g. 45 (ml) or 300 (g). */
	value: number;
	/** Canonical unit: "ml" for the merged volume bucket, otherwise the source unit. */
	unit: string | null;
	/** Human-readable rendering, e.g. "3 msk", "300 g", "2 st". */
	display: string;
}

export interface ShoppingListItem {
	name: string;
	amounts: AggregatedAmount[];
	/** True when at least one source line had no numeric amount ("efter smak"). */
	toTaste: boolean;
	/** Which selected recipes need this ingredient (unique, ascending). */
	recipeIds: number[];
}

export interface ShoppingList {
	servings: number;
	/** One entry per input recipeId, in input order (duplicates repeated). */
	recipes: { recipeId: number; name: string }[];
	items: ShoppingListItem[];
	pantryStaples: ShoppingListItem[];
	generatedAt: string;
}

/** ml per unit for the volume family that merges into a single bucket. */
const ML_PER_UNIT = new Map<string, number>([
	['krm', 1],
	['tsk', 5],
	['msk', 15],
	['dl', 100],
	// Defensive aliases — absent from the current database but free to accept.
	['ml', 1],
	['l', 1000]
]);

/** Largest-first display candidates; the first giving a multiple of 0.25 wins. */
const VOLUME_DISPLAY: readonly { unit: string; ml: number }[] = [
	{ unit: 'dl', ml: 100 },
	{ unit: 'msk', ml: 15 },
	{ unit: 'tsk', ml: 5 },
	{ unit: 'krm', ml: 1 }
];

function assertValidServings(servings: number): void {
	if (!Number.isInteger(servings) || servings < 1) {
		throw new RecipeAggregateError(`servings must be a positive integer, got ${servings}`);
	}
}

const round2 = (v: number): number => Math.round(v * 100) / 100;

const isQuarterMultiple = (v: number): boolean => Math.abs(v * 4 - Math.round(v * 4)) < 1e-9;

function displayVolume(ml: number): string {
	for (const candidate of VOLUME_DISPLAY) {
		const ratio = ml / candidate.ml;
		// The quarter check runs on the RAW ratio — rounding first would let near-misses
		// (49.5 ml → "0.5 dl") masquerade as clean values; round2 only formats the winner.
		// ratio > 0 guard: tiny totals must not render as "0 dl".
		if (ratio > 0 && isQuarterMultiple(ratio)) return `${round2(ratio)} ${candidate.unit}`;
	}
	return `${ml} ml`;
}

interface Group {
	name: string;
	volumeMl: number | null;
	/** folded unit -> bucket keeping the original unit spelling */
	units: Map<string, { unit: string | null; total: number }>;
	toTaste: boolean;
	allBasis: boolean;
	recipeIds: Set<number>;
}

/**
 * Aggregate ingredient lists (as returned by RecipeStore.ingredients, 2 servings each)
 * into shopping-list items scaled to `servings`. Deterministic; volume units merge in ml,
 * every other unit sums only with itself. Groups where every occurrence is a pantry
 * staple (isBasis) end up in pantryStaples, everything else in items.
 */
export function aggregateIngredients(
	lists: RecipeIngredientList[],
	servings: number
): { items: ShoppingListItem[]; pantryStaples: ShoppingListItem[] } {
	assertValidServings(servings);
	const scale = servings / 2;

	const groups = new Map<string, Group>();
	for (const recipe of lists) {
		for (const ingredient of recipe.ingredients) {
			const key = foldText(ingredient.name);
			let group = groups.get(key);
			if (!group) {
				group = {
					name: ingredient.name,
					volumeMl: null,
					units: new Map(),
					toTaste: false,
					allBasis: true,
					recipeIds: new Set()
				};
				groups.set(key, group);
			}
			group.recipeIds.add(recipe.recipeId);
			if (!ingredient.isBasis) group.allBasis = false;
			if (ingredient.amount === null) {
				group.toTaste = true;
				continue;
			}
			const scaled = ingredient.amount * scale;
			const foldedUnit = ingredient.unit === null ? null : foldText(ingredient.unit);
			const mlPerUnit = foldedUnit === null ? undefined : ML_PER_UNIT.get(foldedUnit);
			if (mlPerUnit !== undefined) {
				group.volumeMl = (group.volumeMl ?? 0) + scaled * mlPerUnit;
			} else {
				// A null unit is keyed as '' — safe because normalize.ts collapses
				// empty-string units to null before data reaches disk, so '' never
				// occurs as a real unit.
				const bucket = group.units.get(foldedUnit ?? '');
				if (bucket) bucket.total += scaled;
				else group.units.set(foldedUnit ?? '', { unit: ingredient.unit, total: scaled });
			}
		}
	}

	const items: ShoppingListItem[] = [];
	const pantryStaples: ShoppingListItem[] = [];
	for (const group of groups.values()) {
		const amounts: AggregatedAmount[] = [];
		if (group.volumeMl !== null) {
			const ml = round2(group.volumeMl);
			amounts.push({ value: ml, unit: 'ml', display: displayVolume(ml) });
		}
		for (const bucket of group.units.values()) {
			const value = round2(bucket.total);
			amounts.push({
				value,
				unit: bucket.unit,
				display: bucket.unit === null ? `${value}` : `${value} ${bucket.unit}`
			});
		}
		amounts.sort((a, b) => {
			if (a.unit === null) return b.unit === null ? 0 : 1;
			if (b.unit === null) return -1;
			return a.unit.localeCompare(b.unit, 'sv');
		});
		const item: ShoppingListItem = {
			name: group.name,
			amounts,
			toTaste: group.toTaste,
			recipeIds: [...group.recipeIds].sort((a, b) => a - b)
		};
		(group.allBasis ? pantryStaples : items).push(item);
	}
	const byName = (a: ShoppingListItem, b: ShoppingListItem) => a.name.localeCompare(b.name, 'sv');
	items.sort(byName);
	pantryStaples.sort(byName);
	return { items, pantryStaples };
}

/**
 * Load the selected recipes and aggregate them into a shopping list. Unknown ids fail
 * the whole call (RecipeQueryError from the store) — a hard failure naming the bad id
 * beats a silently incomplete shopping list.
 */
export async function buildShoppingList(
	store: RecipeStore,
	recipeIds: number[],
	servings: number
): Promise<ShoppingList> {
	assertValidServings(servings);
	const lists = await store.ingredients(recipeIds);
	const { items, pantryStaples } = aggregateIngredients(lists, servings);
	return {
		servings,
		recipes: lists.map((l) => ({ recipeId: l.recipeId, name: l.name })),
		items,
		pantryStaples,
		generatedAt: new Date().toISOString()
	};
}

export function defaultShoppingListPath(): string {
	return path.resolve(process.cwd(), 'data/plans/shopping-list.json');
}

/** Persist the latest shopping list (atomic write) for the future web UI. */
export async function saveShoppingList(
	list: ShoppingList,
	filePath: string = defaultShoppingListPath()
): Promise<string> {
	await mkdir(path.dirname(filePath), { recursive: true });
	await writeFileAtomic(filePath, JSON.stringify(list, null, 2) + '\n');
	return filePath;
}

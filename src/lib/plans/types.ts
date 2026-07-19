// Type-only imports from $lib/server are erased at build time, so this module
// stays importable from client code despite referencing server modules.
import type { ShoppingListItem } from '../server/recipes/aggregate';
import type { Money, NormalizedCartLine } from '../server/willys/types';

/**
 * Where a plan is in its lifecycle. Plans start as `new`; the user marks a
 * week `ordered` from the Veckans recept tab once the groceries are ordered.
 * Swedish wording ("Ny" / "Beställd") belongs to the UI, not to the data.
 */
export type PlanStatus = 'new' | 'ordered';

/**
 * One week's dinner plan, persisted as data/plans/<weekId>.json.
 * Contains everything needed to (re)populate the Willys cart: the aggregated
 * ingredient list plus the product snapshot recorded after the cart was filled.
 */
export interface WeeklyPlan {
	version: 1;
	/** ISO week id, e.g. "2026-W29"; must match the filename. */
	weekId: string;
	/** Servings per recipe the shopping list was scaled to. */
	servings: number;
	/** Lifecycle state. Documents written before this field existed load as
	 * `ordered` — see PlanStore.load. */
	status: PlanStatus;
	/** Chosen recipes in input order; duplicates allowed (same dish twice). */
	recipes: { recipeId: number; name: string }[];
	shoppingList: {
		items: ShoppingListItem[];
		pantryStaples: ShoppingListItem[];
	};
	/** Willys products matched to the list; null until plan_record_cart runs
	 * and reset to null when the week is re-aggregated. */
	willysCart: WillysCartSnapshot | null;
	/** When the shopping list was last aggregated. */
	generatedAt: string;
	/** When the plan document was last written (any change). */
	updatedAt: string;
}

/** The Willys cart at the moment the plan's products were recorded. */
export interface WillysCartSnapshot {
	recordedAt: string;
	store: { id: string | null };
	itemCount: number;
	totalQuantity: number;
	lines: NormalizedCartLine[];
	subtotal: Money;
}

/** Display join of a planned recipe against the recipe database, served by
 * GET /api/plans/[week]. `name` comes from the plan doc so it survives the
 * recipe being removed by a re-harvest; `exists` says whether details/images
 * are still available. */
export interface PlanRecipeView {
	recipeId: number;
	name: string;
	exists: boolean;
	headline: string | null;
	mainIngredient: string | null;
	cookingTime: { min: number | null; max: number | null } | null;
	energyKcalPerServing: number | null;
	rating: { average: number | null; count: number | null } | null;
	imageSmall: string | null;
}

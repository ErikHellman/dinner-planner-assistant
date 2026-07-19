import type { NormalizedCartLine } from '../server/willys/types';
import type { WeeklyPlan } from './types';

/** One shopping-list item and the products bought for it. */
export interface CoverageMatch {
	/** The item name as spelled in the shopping list. */
	name: string;
	productIds: string[];
}

export interface CoverageDiff {
	/**
	 * False when no usable coverage was recorded — either the week has no cart
	 * snapshot or the snapshot predates coverage recording. This is "unknown",
	 * NOT "nothing matched": callers must not render an all-unmatched list.
	 */
	hasCoverage: boolean;
	matched: CoverageMatch[];
	/** Shopping-list items (never pantry staples) no live product covers. */
	unmatched: string[];
	/** Cart lines no coverage entry mentions. */
	extra: NormalizedCartLine[];
}

/** The agent copies item names verbatim from the list it was handed, so
 * normalizing case and surrounding space is enough to compare them. */
function key(name: string): string {
	return name.trim().toLowerCase();
}

/**
 * Deterministic diff between a week's shopping list and the products actually
 * recorded in its cart, using the mapping the agent declared while shopping.
 *
 * Coverage pointing at a product that is no longer in the snapshot is stale
 * (the line was removed afterwards) and is ignored, so the items it claimed
 * correctly fall back to unmatched. Coverage naming an item that is not on the
 * list is ignored too, but still explains its product — the user deciding to
 * throw coffee in the cart is not a planning error.
 */
export function buildCoverageDiff(plan: WeeklyPlan): CoverageDiff {
	const snapshot = plan.willysCart;
	if (!snapshot || snapshot.coverage.length === 0) {
		return { hasCoverage: false, matched: [], unmatched: [], extra: [] };
	}

	const linesById = new Map(snapshot.lines.map((line) => [line.productId, line]));
	const productsByItem = new Map<string, string[]>();
	const referencedProducts = new Set<string>();

	for (const entry of snapshot.coverage) {
		if (!linesById.has(entry.productId)) continue;
		referencedProducts.add(entry.productId);
		for (const covered of entry.covers) {
			const itemKey = key(covered);
			const products = productsByItem.get(itemKey);
			if (products) {
				if (!products.includes(entry.productId)) products.push(entry.productId);
			} else {
				productsByItem.set(itemKey, [entry.productId]);
			}
		}
	}

	const matched: CoverageMatch[] = [];
	const unmatched: string[] = [];
	for (const item of plan.shoppingList.items) {
		const productIds = productsByItem.get(key(item.name));
		if (productIds) {
			matched.push({ name: item.name, productIds });
		} else {
			unmatched.push(item.name);
		}
	}

	return {
		hasCoverage: true,
		matched,
		unmatched,
		extra: snapshot.lines.filter((line) => !referencedProducts.has(line.productId))
	};
}

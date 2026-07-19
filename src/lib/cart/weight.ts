/**
 * Weight-priced Willys products (ids ending in _KG) have ASYMMETRIC cart
 * quantity semantics, verified against the live Hybris API:
 *
 * - the cart view REPORTS quantity in grams
 *   {code: "100147967_KG", quantity: 320, pickUnit: {code: "pieces"},
 *    displayVolume: "ca: 160g", price: "14,90 kr/kg", totalPrice: "4,77 kr"}
 * - the addProduct qty param COUNTS PIECES: setting qty=2 yields quantity 320
 *   (2 × the ~160 g piece), and naively echoing the gram figure back as qty
 *   once ordered 76 800 g of onions.
 *
 * So the UI steps these lines in pieces and converts the reported grams back
 * via the approximate piece weight parsed from the display size.
 */
export function isWeightProduct(productId: string): boolean {
	return productId.endsWith('_KG');
}

const WEIGHT_PATTERN = /(\d+(?:[.,]\d+)?)\s*(kg|g)/i;

/** Grams of one approximate piece, parsed from a display size like "ca: 160g".
 * Defaults to 100 g when unparsable. */
export function approxPieceGrams(displaySize: string | null): number {
	const match = displaySize ? WEIGHT_PATTERN.exec(displaySize) : null;
	if (!match) return 100;
	const value = Number(match[1].replace(',', '.'));
	if (!Number.isFinite(value) || value <= 0) return 100;
	return Math.round(match[2].toLowerCase() === 'kg' ? value * 1000 : value);
}

/** Convert the cart's reported gram quantity to a piece count (≥ 1). */
export function piecesFromGrams(quantityGrams: number, displaySize: string | null): number {
	return Math.max(1, Math.round(quantityGrams / approxPieceGrams(displaySize)));
}

import type {
	Money,
	NormalizedCart,
	NormalizedCartLine,
	NormalizedProduct,
	RawProduct,
	UnitPrice
} from './types';

/** Parse a Swedish currency string like "15,90 kr" → 15.9. */
export function parseAmount(formatted?: string | null): number | null {
	if (!formatted) return null;
	const cleaned = formatted.replace(/\s|kr/g, '').replace(',', '.');
	const n = Number.parseFloat(cleaned);
	return Number.isFinite(n) ? n : null;
}

function money(formatted?: string | null): Money {
	return { amount: parseAmount(formatted), formatted: formatted?.trim() || '', currency: 'SEK' };
}

function pickUnitOf(raw: RawProduct): 'pieces' | 'kilogram' {
	return raw.productBasketType?.code === 'KG' ? 'kilogram' : 'pieces';
}

export function normalizeProduct(raw: RawProduct, categories: string[]): NormalizedProduct {
	const unit: UnitPrice = {
		amount: parseAmount(raw.comparePrice),
		unit: raw.comparePriceUnit ?? null,
		formatted:
			raw.comparePrice && raw.comparePriceUnit
				? `${raw.comparePrice.trim()}/${raw.comparePriceUnit}`
				: raw.comparePrice?.trim() || ''
	};
	return {
		productId: raw.code,
		name: raw.name,
		brand: raw.manufacturer ?? null,
		displaySize: raw.displayVolume ?? raw.productLine2 ?? null,
		pickUnit: pickUnitOf(raw),
		price: money(raw.price),
		unitPrice: unit,
		categories,
		categoryCode: raw.categoryCode ?? null,
		labels: raw.labels ?? [],
		inStock: raw.online === true && raw.outOfStock !== true,
		addable: raw.addToCartDisabled !== true && raw.outOfStock !== true,
		imageUrl: raw.image?.url ?? raw.thumbnail?.url ?? null
	};
}

interface RawCart {
	totalItems?: number;
	subTotalPrice?: string;
	totalDepositSum?: string;
	totalDiscountValue?: number;
	products?: RawProduct[];
}

export function normalizeCart(raw: RawCart, storeId: string | null): NormalizedCart {
	const products = raw.products ?? [];
	const lines: NormalizedCartLine[] = products.map((p) => ({
		productId: p.code,
		name: p.name,
		brand: p.manufacturer ?? null,
		quantity: p.quantity ?? 0,
		pickUnit:
			(p as { pickUnit?: { code?: string } }).pickUnit?.code ?? pickUnitOf(p),
		unitPrice: money(p.price),
		lineTotal: money(p.totalPrice),
		categories: p.categoryName ? [p.categoryName] : [],
		displaySize: p.displayVolume ?? p.productLine2 ?? null
	}));
	return {
		store: { id: storeId },
		itemCount: lines.length,
		totalQuantity: lines.reduce((sum, l) => sum + l.quantity, 0),
		lines,
		subtotal: money(raw.subTotalPrice),
		deposit: money(raw.totalDepositSum),
		discountTotal: {
			amount: raw.totalDiscountValue ?? 0,
			formatted: raw.totalDiscountValue ? `${raw.totalDiscountValue} kr` : '0,00 kr',
			currency: 'SEK'
		}
	};
}

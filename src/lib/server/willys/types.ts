/** A price with numeric + formatted forms. */
export interface Money {
	amount: number | null;
	formatted: string;
	currency?: 'SEK';
}

/** Price per unit, e.g. 10.60 kr per "l". */
export interface UnitPrice {
	amount: number | null;
	unit: string | null;
	formatted: string;
}

/** Normalized product for LLM consumption. */
export interface NormalizedProduct {
	productId: string;
	name: string;
	brand: string | null;
	displaySize: string | null;
	pickUnit: 'pieces' | 'kilogram';
	price: Money;
	unitPrice: UnitPrice;
	categories: string[];
	categoryCode: string | null;
	labels: string[];
	inStock: boolean;
	addable: boolean;
	imageUrl: string | null;
}

/** One line in the normalized cart. */
export interface NormalizedCartLine {
	productId: string;
	name: string;
	brand: string | null;
	quantity: number;
	pickUnit: 'pieces' | 'kilogram';
	unitPrice: Money;
	lineTotal: Money;
	categories: string[];
	displaySize: string | null;
}

/** Normalized cart for LLM verification. */
export interface NormalizedCart {
	store: { id: string | null };
	itemCount: number;
	totalQuantity: number;
	lines: NormalizedCartLine[];
	subtotal: Money;
	deposit: Money;
	discountTotal: Money;
}

/** Raw Axfood product (only the fields we read). */
export interface RawProduct {
	code: string;
	name: string;
	manufacturer?: string | null;
	productLine2?: string | null;
	price?: string | null;
	priceValue?: number | null;
	priceUnit?: string | null;
	comparePrice?: string | null;
	comparePriceUnit?: string | null;
	displayVolume?: string | null;
	productBasketType?: { code?: string } | null;
	labels?: string[] | null;
	online?: boolean | null;
	outOfStock?: boolean | null;
	addToCartDisabled?: boolean | null;
	categoryName?: string | null;
	categoryCode?: string | null;
	quantity?: number | null;
	totalPrice?: string | null;
	pickUnit?: { code?: string } | null;
	image?: { url?: string } | null;
	thumbnail?: { url?: string } | null;
}

export interface RawBreadcrumb {
	name: string;
	categoryCode?: string | null;
}

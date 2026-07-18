import { describe, expect, it } from 'vitest';
import { parseAmount, normalizeProduct, normalizeCart } from './normalize';
import type { RawProduct } from './types';

const rawMilk: RawProduct = {
	code: '101233933_ST',
	name: 'Mellanmjölk Längre Hållbarhet 1,5%',
	manufacturer: 'Garant',
	productLine2: 'GARANT, 1,5l',
	price: '15,90 kr',
	priceValue: 15.9,
	priceUnit: 'kr/st',
	comparePrice: '10,60 kr',
	comparePriceUnit: 'l',
	displayVolume: '1,5l',
	productBasketType: { code: 'ST' },
	labels: ['swedish_flag', 'from_sweden'],
	online: true,
	outOfStock: false,
	addToCartDisabled: false,
	image: { url: 'https://assets.axfood.se/img/milk' }
};

describe('parseAmount', () => {
	it('parses Swedish currency strings', () => {
		expect(parseAmount('15,90 kr')).toBe(15.9);
		expect(parseAmount('10,60 kr')).toBe(10.6);
	});
	it('returns null for empty/undefined', () => {
		expect(parseAmount('')).toBeNull();
		expect(parseAmount(undefined)).toBeNull();
	});
});

describe('normalizeProduct', () => {
	it('maps a raw product with enriched categories', () => {
		const p = normalizeProduct(rawMilk, ['Mejeri, ost & ägg', 'Mjölk', 'Mellanmjölk']);
		expect(p).toMatchObject({
			productId: '101233933_ST',
			name: 'Mellanmjölk Längre Hållbarhet 1,5%',
			brand: 'Garant',
			displaySize: '1,5l',
			pickUnit: 'pieces',
			price: { amount: 15.9, formatted: '15,90 kr', currency: 'SEK' },
			unitPrice: { amount: 10.6, unit: 'l', formatted: '10,60 kr/l' },
			categories: ['Mejeri, ost & ägg', 'Mjölk', 'Mellanmjölk'],
			labels: ['swedish_flag', 'from_sweden'],
			inStock: true,
			addable: true,
			imageUrl: 'https://assets.axfood.se/img/milk'
		});
	});

	it('maps KG basket type to kilogram and marks out-of-stock non-addable', () => {
		const p = normalizeProduct(
			{ ...rawMilk, productBasketType: { code: 'KG' }, outOfStock: true, addToCartDisabled: true },
			[]
		);
		expect(p.pickUnit).toBe('kilogram');
		expect(p.inStock).toBe(false);
		expect(p.addable).toBe(false);
	});
});

describe('normalizeCart', () => {
	it('normalizes cart lines and totals', () => {
		const rawCart = {
			totalItems: 1,
			subTotalPrice: '31,80 kr',
			totalDepositSum: '',
			totalDiscountValue: 0,
			store: { id: '2583' },
			products: [
				{
					code: '101233933_ST',
					name: 'Mellanmjölk Längre Hållbarhet 1,5%',
					manufacturer: 'Garant',
					productLine2: 'GARANT, 1,5l',
					displayVolume: '1,5l',
					quantity: 2,
					price: '15,90 kr',
					totalPrice: '31,80 kr',
					pickUnit: { code: 'pieces', name: 'st' },
					categoryName: 'Mejeri, ost & ägg'
				}
			]
		};
		const cart = normalizeCart(rawCart as never, '2583');
		expect(cart.itemCount).toBe(1);
		expect(cart.totalQuantity).toBe(2);
		expect(cart.subtotal).toEqual({ amount: 31.8, formatted: '31,80 kr', currency: 'SEK' });
		expect(cart.lines[0]).toMatchObject({
			productId: '101233933_ST',
			quantity: 2,
			pickUnit: 'pieces',
			unitPrice: { amount: 15.9, formatted: '15,90 kr' },
			lineTotal: { amount: 31.8, formatted: '31,80 kr' }
		});
	});

	it('normalizes an empty cart', () => {
		const cart = normalizeCart({ totalItems: 0, subTotalPrice: '', products: [] } as never, null);
		expect(cart.itemCount).toBe(0);
		expect(cart.lines).toEqual([]);
	});
});

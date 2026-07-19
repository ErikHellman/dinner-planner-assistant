import { describe, expect, it } from 'vitest';
import { parseCartMutation, willysErrorStatus } from './api';
import { WillysConfigError } from './config';
import { WillysAuthError } from './session';

describe('parseCartMutation', () => {
	it('accepts a piece-count mutation and defaults pickUnit to pieces', () => {
		expect(parseCartMutation({ productId: '101233933_ST', quantity: 2 })).toEqual({
			productId: '101233933_ST',
			quantity: 2,
			pickUnit: 'pieces'
		});
	});

	it('accepts zero quantity (line removal)', () => {
		expect(parseCartMutation({ productId: '101233933_ST', quantity: 0 })).toMatchObject({
			quantity: 0
		});
	});

	it('accepts fractional quantities for kilogram lines', () => {
		expect(
			parseCartMutation({ productId: '123_KG', quantity: 0.5, pickUnit: 'kilogram' })
		).toEqual({ productId: '123_KG', quantity: 0.5, pickUnit: 'kilogram' });
	});

	it('rejects fractional quantities for piece lines', () => {
		expect(parseCartMutation({ productId: '1_ST', quantity: 1.5 })).toBeNull();
		expect(parseCartMutation({ productId: '1_ST', quantity: 1.5, pickUnit: 'pieces' })).toBeNull();
	});

	it('rejects malformed bodies', () => {
		expect(parseCartMutation(null)).toBeNull();
		expect(parseCartMutation('nope')).toBeNull();
		expect(parseCartMutation({})).toBeNull();
		expect(parseCartMutation({ productId: '', quantity: 1 })).toBeNull();
		expect(parseCartMutation({ productId: 42, quantity: 1 })).toBeNull();
		expect(parseCartMutation({ productId: '1_ST' })).toBeNull();
		expect(parseCartMutation({ productId: '1_ST', quantity: -1 })).toBeNull();
		expect(parseCartMutation({ productId: '1_ST', quantity: Number.NaN })).toBeNull();
		expect(parseCartMutation({ productId: '1_ST', quantity: Infinity })).toBeNull();
		expect(parseCartMutation({ productId: '1_ST', quantity: 1, pickUnit: 'grams' })).toBeNull();
	});

	it('bounds quantities: the write unit is always pieces, even for _KG lines', () => {
		// The Hybris cart REPORTS _KG quantities in grams but the addProduct qty
		// param counts pieces — sending the gram figure once ordered 76.8 kg of
		// onions. A tight bound keeps that class of bug from reaching Willys.
		expect(parseCartMutation({ productId: '100147967_KG', quantity: 3 })).toMatchObject({
			quantity: 3
		});
		expect(parseCartMutation({ productId: '1_ST', quantity: 999 })).toMatchObject({
			quantity: 999
		});
		expect(parseCartMutation({ productId: '1_ST', quantity: 1000 })).toBeNull();
	});
});

describe('willysErrorStatus', () => {
	it('maps missing credentials to 503 willys_not_configured', () => {
		expect(willysErrorStatus(new WillysConfigError())).toEqual({
			status: 503,
			code: 'willys_not_configured'
		});
	});

	it('maps auth and upstream failures to 502 willys_error', () => {
		expect(willysErrorStatus(new WillysAuthError('login failed'))).toEqual({
			status: 502,
			code: 'willys_error'
		});
		expect(willysErrorStatus(new Error('fetch failed'))).toEqual({
			status: 502,
			code: 'willys_error'
		});
	});
});

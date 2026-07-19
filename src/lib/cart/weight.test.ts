import { describe, expect, it } from 'vitest';
import { approxPieceGrams, isWeightProduct, piecesFromGrams } from './weight';

describe('isWeightProduct', () => {
	it('detects weight-priced products by their id suffix', () => {
		expect(isWeightProduct('100147967_KG')).toBe(true);
		expect(isWeightProduct('101277483_ST')).toBe(false);
	});
});

describe('approxPieceGrams', () => {
	it('parses gram sizes from Willys display strings', () => {
		expect(approxPieceGrams('ca: 160g')).toBe(160);
		expect(approxPieceGrams('ca333g')).toBe(333);
		expect(approxPieceGrams('500g')).toBe(500);
	});

	it('converts kilogram sizes to grams', () => {
		expect(approxPieceGrams('1,2kg')).toBe(1200);
		expect(approxPieceGrams('2kg')).toBe(2000);
	});

	it('falls back to 100 g when the size is missing or not a weight', () => {
		expect(approxPieceGrams(null)).toBe(100);
		expect(approxPieceGrams('6p/3l')).toBe(100);
		expect(approxPieceGrams('')).toBe(100);
	});
});

describe('piecesFromGrams', () => {
	it('converts the reported gram quantity back to pieces', () => {
		expect(piecesFromGrams(320, 'ca: 160g')).toBe(2);
		expect(piecesFromGrams(480, 'ca: 160g')).toBe(3);
	});

	it('rounds to the nearest piece and never drops below one', () => {
		expect(piecesFromGrams(300, 'ca: 160g')).toBe(2);
		expect(piecesFromGrams(50, 'ca: 160g')).toBe(1);
	});
});

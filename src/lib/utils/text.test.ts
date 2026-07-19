import { describe, expect, it } from 'vitest';
import { foldText } from './text';

describe('foldText (client copy)', () => {
	it('lowercases and strips diacritics like the server version', () => {
		expect(foldText('Kalorisnål')).toBe('kalorisnal');
		expect(foldText('KÖTT')).toBe('kott');
		expect(foldText('crème fraîche')).toBe('creme fraiche');
	});
});

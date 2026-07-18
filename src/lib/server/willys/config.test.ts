import { describe, expect, it } from 'vitest';
import { loadWillysConfig, WillysConfigError } from './config';

describe('loadWillysConfig', () => {
	it('returns trimmed credentials when both are present', () => {
		const cfg = loadWillysConfig({ WILLYS_USERNAME: ' 199001011234 ', WILLYS_PASSWORD: 'secret ' });
		expect(cfg).toEqual({ username: '199001011234', password: 'secret' });
	});

	it('throws WillysConfigError when username is missing', () => {
		expect(() => loadWillysConfig({ WILLYS_PASSWORD: 'x' })).toThrow(WillysConfigError);
	});

	it('throws WillysConfigError when password is empty', () => {
		expect(() => loadWillysConfig({ WILLYS_USERNAME: 'x', WILLYS_PASSWORD: '  ' })).toThrow(
			WillysConfigError
		);
	});
});

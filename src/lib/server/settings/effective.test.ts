import { describe, expect, it } from 'vitest';
import {
	apiKeyVarFor,
	effectiveAgentConfig,
	effectiveWillysCredentials,
	effectiveWillysEnv
} from './effective';
import { defaultSettings, type ResolvedSettings } from './store';

function settings(patch: Partial<ResolvedSettings> = {}): ResolvedSettings {
	return { ...defaultSettings(), ...patch };
}

describe('apiKeyVarFor', () => {
	it('derives the env var from the provider id', () => {
		expect(apiKeyVarFor('anthropic')).toBe('ANTHROPIC_API_KEY');
		expect(apiKeyVarFor('some-provider')).toBe('SOME_PROVIDER_API_KEY');
	});

	it('knows the google exception', () => {
		expect(apiKeyVarFor('google')).toBe('GEMINI_API_KEY');
	});
});

describe('effectiveAgentConfig', () => {
	it('falls back to env, then to the built-in defaults', () => {
		expect(effectiveAgentConfig(settings(), {})).toEqual({
			provider: 'anthropic',
			model: 'claude-sonnet-5',
			apiKey: null,
			apiKeyVar: 'ANTHROPIC_API_KEY',
			apiKeySource: 'none'
		});
		expect(
			effectiveAgentConfig(settings(), { PI_PROVIDER: 'openai', OPENAI_API_KEY: 'sk-env' })
		).toMatchObject({ provider: 'openai', apiKey: 'sk-env', apiKeySource: 'env' });
	});

	it('prefers settings over env', () => {
		const config = effectiveAgentConfig(
			settings({ llm: { provider: 'openai', model: 'gpt-5', apiKey: 'sk-settings' } }),
			{ PI_PROVIDER: 'anthropic', PI_MODEL: 'claude-sonnet-5', OPENAI_API_KEY: 'sk-env' }
		);
		expect(config).toEqual({
			provider: 'openai',
			model: 'gpt-5',
			apiKey: 'sk-settings',
			apiKeyVar: 'OPENAI_API_KEY',
			apiKeySource: 'settings'
		});
	});

	it('reads the key for the provider chosen in settings, not the env provider', () => {
		const config = effectiveAgentConfig(
			settings({ llm: { provider: 'openai', model: null, apiKey: null } }),
			{ PI_PROVIDER: 'anthropic', ANTHROPIC_API_KEY: 'sk-ant', OPENAI_API_KEY: 'sk-openai' }
		);
		expect(config.apiKey).toBe('sk-openai');
	});
});

describe('effectiveWillysCredentials', () => {
	it('mixes settings and env per field', () => {
		const creds = effectiveWillysCredentials(
			settings({ willys: { username: '199001011234', password: null } }),
			{ WILLYS_USERNAME: '000000000000', WILLYS_PASSWORD: 'env-pw' }
		);
		expect(creds).toEqual({
			username: '199001011234',
			usernameSource: 'settings',
			password: 'env-pw',
			passwordSource: 'env'
		});
	});
});

describe('effectiveWillysEnv', () => {
	it('reads the snapshot lazily on every access', () => {
		let current = settings();
		const env = effectiveWillysEnv(() => current, {});
		expect(env.WILLYS_USERNAME).toBeUndefined();
		current = settings({ willys: { username: 'u', password: 'p' } });
		expect(env.WILLYS_USERNAME).toBe('u');
		expect(env.WILLYS_PASSWORD).toBe('p');
	});
});

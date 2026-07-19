import type { SettingsSource } from '../../settings/types';
import type { ResolvedSettings } from './store';

export const DEFAULT_PROVIDER = 'anthropic';
export const DEFAULT_MODEL = 'claude-sonnet-5';

export type EnvRecord = Record<string, string | undefined>;

/** Env var holding the API key for a provider, e.g. anthropic -> ANTHROPIC_API_KEY. */
export function apiKeyVarFor(provider: string): string {
	const exceptions: Record<string, string> = { google: 'GEMINI_API_KEY' };
	return exceptions[provider] ?? `${provider.toUpperCase().replace(/-/g, '_')}_API_KEY`;
}

function pick(fromSettings: string | null, fromEnv: string | undefined) {
	if (fromSettings) return { value: fromSettings, source: 'settings' as SettingsSource };
	const trimmed = fromEnv?.trim();
	if (trimmed) return { value: trimmed, source: 'env' as SettingsSource };
	return { value: null, source: 'none' as SettingsSource };
}

export interface EffectiveAgentConfig {
	provider: string;
	model: string;
	/** null when neither settings nor .env supply a key. */
	apiKey: string | null;
	apiKeyVar: string;
	apiKeySource: SettingsSource;
}

/**
 * The one place "settings value, else .env, else built-in default" is decided
 * for the LLM configuration. Non-throwing: callers that need a key present
 * (agent init) check `apiKey` themselves.
 */
export function effectiveAgentConfig(
	settings: ResolvedSettings,
	env: EnvRecord
): EffectiveAgentConfig {
	const provider = pick(settings.llm.provider, env.PI_PROVIDER).value ?? DEFAULT_PROVIDER;
	const model = pick(settings.llm.model, env.PI_MODEL).value ?? DEFAULT_MODEL;
	const apiKeyVar = apiKeyVarFor(provider);
	const { value: apiKey, source: apiKeySource } = pick(settings.llm.apiKey, env[apiKeyVar]);
	return { provider, model, apiKey, apiKeyVar, apiKeySource };
}

export interface EffectiveWillysCredentials {
	username: string | null;
	usernameSource: SettingsSource;
	password: string | null;
	passwordSource: SettingsSource;
}

export function effectiveWillysCredentials(
	settings: ResolvedSettings,
	env: EnvRecord
): EffectiveWillysCredentials {
	const username = pick(settings.willys.username, env.WILLYS_USERNAME);
	const password = pick(settings.willys.password, env.WILLYS_PASSWORD);
	return {
		username: username.value,
		usernameSource: username.source,
		password: password.value,
		passwordSource: password.source
	};
}

/**
 * An env-shaped view of the effective Willys credentials. `WillysSession` reads
 * its env record lazily (at auth time), so the getters here let a settings
 * change take effect without changing that contract.
 */
export function effectiveWillysEnv(getSettings: () => ResolvedSettings, env: EnvRecord): EnvRecord {
	return {
		get WILLYS_USERNAME() {
			return effectiveWillysCredentials(getSettings(), env).username ?? undefined;
		},
		get WILLYS_PASSWORD() {
			return effectiveWillysCredentials(getSettings(), env).password ?? undefined;
		}
	};
}

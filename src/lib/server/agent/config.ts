import { env } from '$env/dynamic/private';

/** Configuration problems the user can fix in .env, surfaced as a friendly error. */
export class AgentConfigError extends Error {}

export interface AgentConfig {
	provider: string;
	model: string;
	apiKey: string;
	apiKeyVar: string;
}

const DEFAULT_PROVIDER = 'anthropic';
const DEFAULT_MODEL = 'claude-sonnet-5';

/** Env var holding the API key for a provider, e.g. anthropic -> ANTHROPIC_API_KEY. */
export function apiKeyVarFor(provider: string): string {
	const exceptions: Record<string, string> = { google: 'GEMINI_API_KEY' };
	return exceptions[provider] ?? `${provider.toUpperCase().replace(/-/g, '_')}_API_KEY`;
}

/** Non-throwing view of the configuration, for the health endpoint. */
export function describeAgentConfig() {
	const provider = env.PI_PROVIDER || DEFAULT_PROVIDER;
	const model = env.PI_MODEL || DEFAULT_MODEL;
	const apiKeyVar = apiKeyVarFor(provider);
	return { provider, model, apiKeyVar, apiKeyConfigured: Boolean(env[apiKeyVar]) };
}

export function getAgentConfig(): AgentConfig {
	const { provider, model, apiKeyVar } = describeAgentConfig();
	const apiKey = env[apiKeyVar];
	if (!apiKey) {
		throw new AgentConfigError(
			`Missing ${apiKeyVar}. Copy .env.example to .env and set your API key, then restart the server.`
		);
	}
	return { provider, model, apiKey, apiKeyVar };
}

import { env } from '$env/dynamic/private';
import { apiKeyVarFor, effectiveAgentConfig } from '../settings/effective';
import { getSettingsSnapshot } from '../settings/shared';

/** Configuration problems the user can fix in the Inställningar tab (or .env),
 * surfaced as a friendly error. */
export class AgentConfigError extends Error {}

export interface AgentConfig {
	provider: string;
	model: string;
	apiKey: string;
	apiKeyVar: string;
}

export { apiKeyVarFor };

/** Non-throwing view of the configuration, for the health endpoint. Saved
 * settings win over .env — see settings/effective.ts. */
export function describeAgentConfig() {
	const { provider, model, apiKey, apiKeyVar } = effectiveAgentConfig(getSettingsSnapshot(), env);
	return { provider, model, apiKeyVar, apiKeyConfigured: Boolean(apiKey) };
}

export function getAgentConfig(): AgentConfig {
	const { provider, model, apiKey, apiKeyVar } = effectiveAgentConfig(getSettingsSnapshot(), env);
	if (!apiKey) {
		throw new AgentConfigError(
			`Missing API key for ${provider}. Add it in the Inställningar tab, or set ${apiKeyVar} in .env and restart the server.`
		);
	}
	return { provider, model, apiKey, apiKeyVar };
}

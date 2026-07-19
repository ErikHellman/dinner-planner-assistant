import type { SettingsPatch, SettingsView } from '../../settings/types';
import { coreSystemPrompt } from '../agent/prompt';
import { effectiveAgentConfig, effectiveWillysCredentials, type EnvRecord } from './effective';
import type { ResolvedSettings } from './store';

/** The client-facing projection: everything except the secret VALUES, which
 * never leave the server — only where they come from. */
export function toSettingsView(settings: ResolvedSettings, env: EnvRecord): SettingsView {
	const llm = effectiveAgentConfig(settings, env);
	const willys = effectiveWillysCredentials(settings, env);
	return {
		extraInstructions: settings.extraInstructions,
		foodPreferences: settings.foodPreferences,
		dislikesAllergies: settings.dislikesAllergies,
		llm: {
			provider: settings.llm.provider,
			model: settings.llm.model,
			effectiveProvider: llm.provider,
			effectiveModel: llm.model,
			apiKeyVar: llm.apiKeyVar,
			apiKeySource: llm.apiKeySource
		},
		willys: {
			username: settings.willys.username,
			usernameSource: willys.usernameSource,
			passwordSource: willys.passwordSource
		},
		corePrompt: coreSystemPrompt(),
		secretError: settings.secretError,
		updatedAt: settings.updatedAt
	};
}

export class SettingsRequestError extends Error {}

function text(value: unknown, field: string): string {
	if (typeof value !== 'string') throw new SettingsRequestError(`${field} must be a string`);
	if (value.length > 20_000) throw new SettingsRequestError(`${field} is too long`);
	return value;
}

/**
 * Validate a PUT body into a patch. Only the fields present are touched; for
 * the two secrets, '' means "clear" and any other string means "set".
 */
export function parseSettingsPatch(body: unknown): SettingsPatch {
	if (typeof body !== 'object' || body === null) {
		throw new SettingsRequestError('Expected a settings object');
	}
	const raw = body as Record<string, unknown>;
	const patch: SettingsPatch = {};

	for (const field of ['extraInstructions', 'foodPreferences', 'dislikesAllergies'] as const) {
		if (raw[field] !== undefined) patch[field] = text(raw[field], field);
	}

	if (raw.llm !== undefined) {
		if (typeof raw.llm !== 'object' || raw.llm === null) {
			throw new SettingsRequestError('llm must be an object');
		}
		const llm = raw.llm as Record<string, unknown>;
		patch.llm = {};
		if (llm.provider !== undefined) patch.llm.provider = text(llm.provider, 'llm.provider');
		if (llm.model !== undefined) patch.llm.model = text(llm.model, 'llm.model');
		if (llm.apiKey !== undefined) patch.llm.apiKey = text(llm.apiKey, 'llm.apiKey');
	}

	if (raw.willys !== undefined) {
		if (typeof raw.willys !== 'object' || raw.willys === null) {
			throw new SettingsRequestError('willys must be an object');
		}
		const willys = raw.willys as Record<string, unknown>;
		patch.willys = {};
		if (willys.username !== undefined) {
			patch.willys.username = text(willys.username, 'willys.username');
		}
		if (willys.password !== undefined) {
			patch.willys.password = text(willys.password, 'willys.password');
		}
	}

	return patch;
}

/** Whether a patch changes the Willys credentials, i.e. whether the shared
 * client (and its cookie jar) must be thrown away. */
export function changesWillysCredentials(patch: SettingsPatch, before: ResolvedSettings): boolean {
	const nextValue = (patched: string | null | undefined, current: string | null) =>
		patched === undefined ? current : patched?.trim() || null;
	return (
		nextValue(patch.willys?.username, before.willys.username) !== before.willys.username ||
		nextValue(patch.willys?.password, before.willys.password) !== before.willys.password
	);
}

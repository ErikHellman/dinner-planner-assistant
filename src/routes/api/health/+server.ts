import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';
import { describeAgentConfig } from '$lib/server/agent/config';
import { effectiveWillysEnv } from '$lib/server/settings/effective';
import { isWillysConfigured } from '$lib/server/willys/config';
import { getSettingsSnapshot } from '$lib/server/settings/shared';

export const GET: RequestHandler = () => {
	// Both reads go through the saved settings first (.env is the fallback), so
	// the banner reflects what the Inställningar tab shows.
	const { provider, model, apiKeyVar, apiKeyConfigured } = describeAgentConfig();
	return json({
		ok: apiKeyConfigured,
		provider,
		model,
		apiKeyVar,
		apiKeyConfigured,
		willysConfigured: isWillysConfigured(effectiveWillysEnv(getSettingsSnapshot, env))
	});
};

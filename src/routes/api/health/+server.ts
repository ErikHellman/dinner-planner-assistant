import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';
import { describeAgentConfig } from '$lib/server/agent/config';
import { isWillysConfigured } from '$lib/server/willys/config';

export const GET: RequestHandler = () => {
	const { provider, model, apiKeyVar, apiKeyConfigured } = describeAgentConfig();
	return json({
		ok: apiKeyConfigured,
		provider,
		model,
		apiKeyVar,
		apiKeyConfigured,
		willysConfigured: isWillysConfigured(env)
	});
};

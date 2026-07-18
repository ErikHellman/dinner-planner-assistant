import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { describeAgentConfig } from '$lib/server/agent/config';

export const GET: RequestHandler = () => {
	const { provider, model, apiKeyVar, apiKeyConfigured } = describeAgentConfig();
	return json({ ok: apiKeyConfigured, provider, model, apiKeyVar, apiKeyConfigured });
};

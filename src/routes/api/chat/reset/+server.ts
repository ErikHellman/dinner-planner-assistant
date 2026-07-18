import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { resetAgent } from '$lib/server/agent/session';

export const POST: RequestHandler = async () => {
	await resetAgent();
	return json({ ok: true });
};

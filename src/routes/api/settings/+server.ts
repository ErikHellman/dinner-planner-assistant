import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';
import { resetAgent } from '$lib/server/agent/session';
import { getSettingsSnapshot, loadSettings, saveSettings } from '$lib/server/settings/shared';
import {
	changesWillysCredentials,
	parseSettingsPatch,
	SettingsRequestError,
	toSettingsView
} from '$lib/server/settings/view';
import { resetWillysClient } from '$lib/server/willys/shared';

function settingsError(err: unknown) {
	const message = err instanceof Error ? err.message : String(err);
	return json({ error: message, code: 'settings_error' }, { status: 500 });
}

export const GET: RequestHandler = async () => {
	try {
		return json({ settings: toSettingsView(await loadSettings(), env) });
	} catch (err) {
		return settingsError(err);
	}
};

/**
 * Save a partial update, then restart the agent session — provider, model, key
 * and prompt are all baked in at session init, so nothing short of a restart
 * applies them. The Willys client is rebuilt only when its credentials changed.
 */
export const PUT: RequestHandler = async ({ request }) => {
	let patch;
	try {
		patch = parseSettingsPatch(await request.json().catch(() => null));
	} catch (err) {
		const message = err instanceof SettingsRequestError ? err.message : 'Invalid settings body';
		return json({ error: message, code: 'bad_request' }, { status: 400 });
	}
	try {
		const willysChanged = changesWillysCredentials(patch, getSettingsSnapshot());
		const settings = await saveSettings(patch);
		await resetAgent();
		if (willysChanged) await resetWillysClient();
		return json({ settings: toSettingsView(settings, env) });
	} catch (err) {
		return settingsError(err);
	}
};

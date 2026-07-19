import type { ServerInit } from '@sveltejs/kit';
import { ensureSettingsLoaded } from '$lib/server/settings/shared';

/** Prime the settings snapshot before the first request: synchronous consumers
 * (the effective LLM config, the Willys credential view) read it directly. */
export const init: ServerInit = async () => {
	await ensureSettingsLoaded();
};

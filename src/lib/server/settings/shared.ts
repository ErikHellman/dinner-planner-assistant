import type { SettingsPatch } from '../../settings/types';
import { defaultSettings, SettingsStore, type ResolvedSettings } from './store';

// One store and one in-memory snapshot for the whole server. The snapshot lets
// synchronous consumers (the Willys env view) read settings without awaiting a
// file read; hooks.server.ts primes it before the first request. Cached on
// globalThis to survive Vite HMR reloads, like the Willys client.
const g = globalThis as typeof globalThis & {
	__settingsStore?: SettingsStore;
	__settingsSnapshot?: ResolvedSettings;
};

export function getSettingsStore(): SettingsStore {
	g.__settingsStore ??= new SettingsStore();
	return g.__settingsStore;
}

/** The last loaded settings, or defaults when nothing has been loaded yet
 * (fresh install, or a corrupt file that failed to load at startup). */
export function getSettingsSnapshot(): ResolvedSettings {
	return g.__settingsSnapshot ?? defaultSettings();
}

/** Load settings from disk into the snapshot. Throws on a corrupt file. */
export async function loadSettings(): Promise<ResolvedSettings> {
	const settings = await getSettingsStore().load();
	g.__settingsSnapshot = settings;
	return settings;
}

/** Prime the snapshot once at server start; a corrupt file must not stop the
 * server from booting — the Inställningar tab surfaces the error. */
export async function ensureSettingsLoaded(): Promise<void> {
	if (g.__settingsSnapshot) return;
	try {
		await loadSettings();
	} catch (err) {
		console.warn('[settings] could not load data/settings.json:', err);
	}
}

export async function saveSettings(patch: SettingsPatch): Promise<ResolvedSettings> {
	const settings = await getSettingsStore().save(patch);
	g.__settingsSnapshot = settings;
	return settings;
}

/** Where a resolved value came from: the settings file, .env, or nowhere. */
export type SettingsSource = 'settings' | 'env' | 'none';

/**
 * The settings document, persisted as data/settings.json.
 * `llm.apiKey` and `willys.password` are stored ENCRYPTED (see
 * `src/lib/server/settings/secrets.ts`) and never leave the server; the client
 * sees only the `*Source` fields of `SettingsView` below.
 * A null field means "not set here" and falls back to the matching env var.
 */
export interface Settings {
	version: 1;
	/** Appended to the fixed core system prompt. */
	extraInstructions: string;
	/** Free text: what the user generally likes to eat. */
	foodPreferences: string;
	/** Free text: disliked food and allergies (hard constraints). */
	dislikesAllergies: string;
	llm: {
		provider: string | null;
		model: string | null;
		/** Encrypted blob, not the key itself. */
		apiKey: string | null;
	};
	willys: {
		username: string | null;
		/** Encrypted blob, not the password itself. */
		password: string | null;
	};
	updatedAt: string;
}

/** Partial update accepted by PUT /api/settings and SettingsStore.save().
 * For the two secret fields: absent = keep, '' = clear, string = set. */
export interface SettingsPatch {
	extraInstructions?: string;
	foodPreferences?: string;
	dislikesAllergies?: string;
	llm?: { provider?: string | null; model?: string | null; apiKey?: string };
	willys?: { username?: string | null; password?: string };
}

/** What GET/PUT /api/settings return — the same document minus every secret. */
export interface SettingsView {
	extraInstructions: string;
	foodPreferences: string;
	dislikesAllergies: string;
	llm: {
		/** Value stored in settings (null = falling back to .env). */
		provider: string | null;
		model: string | null;
		/** Actually in use after the env fallback. */
		effectiveProvider: string;
		effectiveModel: string;
		/** Env var the key would come from, e.g. ANTHROPIC_API_KEY. */
		apiKeyVar: string;
		apiKeySource: SettingsSource;
	};
	willys: {
		/** Only the value stored in settings — a username coming from .env is a
		 * personnummer, and there is no reason to ship it to the browser. */
		username: string | null;
		usernameSource: SettingsSource;
		passwordSource: SettingsSource;
	};
	/** The fixed core system prompt, for the read-only preview. */
	corePrompt: string;
	/** Set when a stored secret could not be decrypted, so the UI can say so. */
	secretError: string | null;
	updatedAt: string;
}

/** GET /api/settings/models — Pi's provider/model catalog for the dropdowns. */
export interface ModelCatalog {
	providers: {
		id: string;
		name: string;
		models: { id: string; name: string }[];
	}[];
}

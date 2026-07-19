import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import type { Settings, SettingsPatch } from '../../settings/types';
import { writeFileAtomic } from '../recipes/atomic-write';
import { decryptSecret, encryptSecret, getOrCreateKey, SecretsError } from './secrets';

export class SettingsStoreError extends Error {}

/** The settings document with its secrets decrypted. Never serialise this to
 * the client — the API returns `SettingsView` instead. */
export interface ResolvedSettings extends Omit<Settings, 'llm' | 'willys'> {
	llm: { provider: string | null; model: string | null; apiKey: string | null };
	willys: { username: string | null; password: string | null };
	/** Set when a stored secret could not be decrypted (key/file mismatch);
	 * the affected secrets read as null so the app still starts. */
	secretError: string | null;
}

export function defaultSettingsFile(): string {
	return path.resolve(process.cwd(), 'data/settings.json');
}

export function defaultSettings(): ResolvedSettings {
	return {
		version: 1,
		extraInstructions: '',
		foodPreferences: '',
		dislikesAllergies: '',
		llm: { provider: null, model: null, apiKey: null },
		willys: { username: null, password: null },
		updatedAt: '',
		secretError: null
	};
}

function isSettingsShape(value: unknown): value is Settings {
	if (typeof value !== 'object' || value === null) return false;
	const s = value as Partial<Settings>;
	return (
		s.version === 1 &&
		typeof s.extraInstructions === 'string' &&
		typeof s.foodPreferences === 'string' &&
		typeof s.dislikesAllergies === 'string' &&
		typeof s.llm === 'object' &&
		s.llm !== null &&
		typeof s.willys === 'object' &&
		s.willys !== null
	);
}

/** Trimmed value, or null for blank/absent — "not set here, fall back to .env". */
function normalize(value: string | null | undefined): string | null {
	const trimmed = value?.trim();
	return trimmed ? trimmed : null;
}

/**
 * data/settings.json, the single writable configuration document. Missing file
 * = defaults, so a fresh install behaves exactly like before this feature: every
 * null falls back to the matching .env var (see effective.ts).
 */
export class SettingsStore {
	constructor(
		private readonly file: string = defaultSettingsFile(),
		private readonly keyFile?: string
	) {}

	filePath(): string {
		return this.file;
	}

	async load(): Promise<ResolvedSettings> {
		let text: string;
		try {
			text = await readFile(this.file, 'utf8');
		} catch (err) {
			if ((err as NodeJS.ErrnoException).code === 'ENOENT') return defaultSettings();
			throw err;
		}
		let parsed: unknown;
		try {
			parsed = JSON.parse(text);
		} catch {
			throw new SettingsStoreError(`Settings file ${this.file} is corrupt: not valid JSON.`);
		}
		if (!isSettingsShape(parsed)) {
			throw new SettingsStoreError(
				`Settings file ${this.file} is corrupt: not a version-1 settings document.`
			);
		}
		return this.#decrypt(parsed);
	}

	/** Merge a partial update and persist it. Secret fields follow the wire
	 * contract: absent keeps the stored value, '' clears it, a string sets it. */
	async save(patch: SettingsPatch): Promise<ResolvedSettings> {
		const current = await this.load();
		const key = await getOrCreateKey(this.keyFile);

		const secret = (value: string | undefined, previous: string | null): string | null => {
			if (value === undefined) return previous ? encryptSecret(previous, key) : null;
			const trimmed = value.trim();
			return trimmed ? encryptSecret(trimmed, key) : null;
		};

		const next: Settings = {
			version: 1,
			extraInstructions: patch.extraInstructions ?? current.extraInstructions,
			foodPreferences: patch.foodPreferences ?? current.foodPreferences,
			dislikesAllergies: patch.dislikesAllergies ?? current.dislikesAllergies,
			llm: {
				provider:
					patch.llm?.provider === undefined ? current.llm.provider : normalize(patch.llm.provider),
				model: patch.llm?.model === undefined ? current.llm.model : normalize(patch.llm.model),
				apiKey: secret(patch.llm?.apiKey, current.llm.apiKey)
			},
			willys: {
				username:
					patch.willys?.username === undefined
						? current.willys.username
						: normalize(patch.willys.username),
				password: secret(patch.willys?.password, current.willys.password)
			},
			updatedAt: new Date().toISOString()
		};

		await mkdir(path.dirname(this.file), { recursive: true });
		await writeFileAtomic(this.file, JSON.stringify(next, null, 2) + '\n');
		return this.#decrypt(next);
	}

	async #decrypt(stored: Settings): Promise<ResolvedSettings> {
		const resolved: ResolvedSettings = {
			...stored,
			llm: { ...stored.llm, apiKey: null },
			willys: { ...stored.willys, password: null },
			secretError: null
		};
		if (!stored.llm.apiKey && !stored.willys.password) return resolved;
		try {
			const key = await getOrCreateKey(this.keyFile);
			if (stored.llm.apiKey) resolved.llm.apiKey = decryptSecret(stored.llm.apiKey, key);
			if (stored.willys.password) {
				resolved.willys.password = decryptSecret(stored.willys.password, key);
			}
		} catch (err) {
			// An unreadable secret must not stop the app from booting: report it
			// and let the fields read as unset so the user can re-enter them.
			if (!(err instanceof SecretsError)) throw err;
			resolved.llm.apiKey = null;
			resolved.willys.password = null;
			resolved.secretError = err.message;
		}
		return resolved;
	}
}

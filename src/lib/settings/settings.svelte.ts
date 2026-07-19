import { apiFetch, messageFor } from '$lib/api/client';
import type { ModelCatalog, SettingsView } from './types';

/** The editable form. Secret fields start empty and mean "leave as is"; the
 * matching `cleared` flag is the explicit "remove the saved value" signal. */
interface SettingsForm {
	extraInstructions: string;
	foodPreferences: string;
	dislikesAllergies: string;
	provider: string;
	model: string;
	apiKey: string;
	apiKeyCleared: boolean;
	willysUsername: string;
	willysPassword: string;
	willysPasswordCleared: boolean;
}

function emptyForm(): SettingsForm {
	return {
		extraInstructions: '',
		foodPreferences: '',
		dislikesAllergies: '',
		provider: '',
		model: '',
		apiKey: '',
		apiKeyCleared: false,
		willysUsername: '',
		willysPassword: '',
		willysPasswordCleared: false
	};
}

function formFor(view: SettingsView): SettingsForm {
	return {
		...emptyForm(),
		extraInstructions: view.extraInstructions,
		foodPreferences: view.foodPreferences,
		dislikesAllergies: view.dislikesAllergies,
		provider: view.llm.provider ?? '',
		model: view.llm.model ?? '',
		willysUsername: view.willys.username ?? ''
	};
}

/** Client state for the Inställningar tab. Saving restarts the agent session,
 * so it is always an explicit, confirmed action — never an autosave. */
export class SettingsStore {
	view = $state.raw<SettingsView | null>(null);
	catalog = $state.raw<ModelCatalog>({ providers: [] });
	form = $state<SettingsForm>(emptyForm());
	status = $state<'idle' | 'loading'>('idle');
	saving = $state(false);
	error = $state<string | null>(null);
	/** True right after a successful save, until the next edit. */
	saved = $state(false);

	/** Models offered for the provider currently selected in the form. */
	readonly models = $derived(
		this.catalog.providers.find(
			(provider) => provider.id === (this.form.provider || this.view?.llm.effectiveProvider)
		)?.models ?? []
	);

	readonly dirty = $derived.by(() => {
		const view = this.view;
		if (!view) return false;
		const form = this.form;
		return (
			form.extraInstructions !== view.extraInstructions ||
			form.foodPreferences !== view.foodPreferences ||
			form.dislikesAllergies !== view.dislikesAllergies ||
			form.provider !== (view.llm.provider ?? '') ||
			form.model !== (view.llm.model ?? '') ||
			form.willysUsername !== (view.willys.username ?? '') ||
			form.apiKey !== '' ||
			form.willysPassword !== '' ||
			form.apiKeyCleared ||
			form.willysPasswordCleared
		);
	});

	async load(): Promise<void> {
		this.status = 'loading';
		this.error = null;
		try {
			const [{ settings }, catalog] = await Promise.all([
				apiFetch<{ settings: SettingsView }>('/api/settings'),
				apiFetch<ModelCatalog>('/api/settings/models').catch(() => ({ providers: [] }))
			]);
			this.view = settings;
			this.catalog = catalog;
			this.form = formFor(settings);
		} catch (err) {
			this.error = messageFor(err);
		} finally {
			this.status = 'idle';
		}
	}

	/** Only the changed fields are sent: an absent secret keeps the stored one. */
	async save(): Promise<void> {
		if (this.saving) return;
		const form = this.form;
		this.saving = true;
		this.error = null;
		this.saved = false;
		const body: Record<string, unknown> = {
			extraInstructions: form.extraInstructions,
			foodPreferences: form.foodPreferences,
			dislikesAllergies: form.dislikesAllergies,
			llm: { provider: form.provider, model: form.model },
			willys: { username: form.willysUsername }
		};
		if (form.apiKey) (body.llm as Record<string, unknown>).apiKey = form.apiKey;
		else if (form.apiKeyCleared) (body.llm as Record<string, unknown>).apiKey = '';
		if (form.willysPassword)
			(body.willys as Record<string, unknown>).password = form.willysPassword;
		else if (form.willysPasswordCleared) (body.willys as Record<string, unknown>).password = '';

		try {
			const { settings } = await apiFetch<{ settings: SettingsView }>('/api/settings', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body)
			});
			this.view = settings;
			this.form = formFor(settings);
			this.saved = true;
		} catch (err) {
			this.error = messageFor(err);
		} finally {
			this.saving = false;
		}
	}

	/** Throw away unsaved edits. */
	reset(): void {
		if (this.view) this.form = formFor(this.view);
		this.saved = false;
		this.error = null;
	}
}

export const settingsStore = new SettingsStore();

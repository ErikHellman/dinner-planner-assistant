<script lang="ts">
	import { settingsStore } from '$lib/settings/settings.svelte';
	import SettingsSection from './SettingsSection.svelte';

	const store = settingsStore;
</script>

<SettingsSection
	title="Matpreferenser"
	description="Skickas med i assistentens kontext vid varje ny chatt. Skriv fritt — t.ex. favoriträtter, hur mycket tid du vill lägga eller hur många ni är."
>
	<label for="food-preferences">Allmänna matpreferenser</label>
	<textarea
		id="food-preferences"
		rows="5"
		placeholder="T.ex. “Vi är två vuxna, gillar starkt och medelhavsmat, max 30 minuters matlagning på vardagar.”"
		bind:value={store.form.foodPreferences}></textarea>
</SettingsSection>

<SettingsSection
	title="Ogillar och allergier"
	description="Behandlas som hårda krav: assistenten föreslår aldrig rätter med det här i."
>
	<label for="dislikes-allergies">Ogillar / allergier</label>
	<textarea
		id="dislikes-allergies"
		rows="5"
		placeholder="T.ex. “Allergi mot nötter och skaldjur. Ingen koriander.”"
		bind:value={store.form.dislikesAllergies}></textarea>
</SettingsSection>

<style>
	label {
		font-size: var(--text-sm);
		font-weight: 600;
	}

	textarea {
		font: inherit;
		padding: var(--space-2) var(--space-3);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		background: var(--bg);
		color: var(--text);
		resize: vertical;
	}
</style>

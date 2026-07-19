<script lang="ts">
	import { settingsStore } from '$lib/settings/settings.svelte';
	import SecretField from './SecretField.svelte';
	import SettingsSection from './SettingsSection.svelte';

	const store = settingsStore;
	const view = $derived(store.view);
</script>

<SettingsSection
	title="Willys-inloggning"
	description="Personnummer (ÅÅÅÅMMDDNNNN) eller Willys Plus-nummer och lösenordet du använder på willys.se. Krävs för att söka varor och fylla varukorgen."
>
	<div class="row">
		<label for="willys-username">Användarnamn</label>
		<input
			id="willys-username"
			autocomplete="off"
			placeholder={view?.willys.usernameSource === 'env' ? 'Hämtas från .env' : 'ÅÅÅÅMMDDNNNN'}
			bind:value={store.form.willysUsername}
		/>
	</div>

	{#if view}
		<SecretField
			id="willys-password"
			label="Lösenord"
			source={view.willys.passwordSource}
			envVar="WILLYS_PASSWORD"
			bind:value={store.form.willysPassword}
			bind:cleared={store.form.willysPasswordCleared}
		/>
	{/if}
</SettingsSection>

<style>
	.row {
		display: grid;
		gap: var(--space-2);
	}

	label {
		font-size: var(--text-sm);
		font-weight: 600;
	}

	input {
		font: inherit;
		padding: var(--space-2) var(--space-3);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		background: var(--bg);
		color: var(--text);
	}
</style>

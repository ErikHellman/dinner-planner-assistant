<script lang="ts">
	import { settingsStore } from '$lib/settings/settings.svelte';
	import SecretField from './SecretField.svelte';
	import SettingsSection from './SettingsSection.svelte';

	const store = settingsStore;
	const view = $derived(store.view);
	/** No catalog (offline, or Pi could not build it) → free-text ids instead. */
	const hasCatalog = $derived(store.catalog.providers.length > 0);
</script>

<SettingsSection
	title="LLM-leverantör"
	description="Tomt fält betyder att värdet hämtas från .env. Ändringar startar om chatten."
>
	<div class="row">
		<label for="provider">Leverantör</label>
		{#if hasCatalog}
			<select id="provider" bind:value={store.form.provider}>
				<option value="">Från .env ({view?.llm.effectiveProvider})</option>
				{#each store.catalog.providers as provider (provider.id)}
					<option value={provider.id}>{provider.name}</option>
				{/each}
			</select>
		{:else}
			<input
				id="provider"
				placeholder={view?.llm.effectiveProvider ?? 'anthropic'}
				bind:value={store.form.provider}
			/>
		{/if}
	</div>

	<div class="row">
		<label for="model">Modell</label>
		{#if hasCatalog && store.models.length > 0}
			<select id="model" bind:value={store.form.model}>
				<option value="">Från .env ({view?.llm.effectiveModel})</option>
				{#each store.models as model (model.id)}
					<option value={model.id}>{model.name}</option>
				{/each}
			</select>
		{:else}
			<input
				id="model"
				placeholder={view?.llm.effectiveModel ?? 'claude-sonnet-5'}
				bind:value={store.form.model}
			/>
		{/if}
	</div>

	{#if view}
		<SecretField
			id="api-key"
			label="API-nyckel"
			source={view.llm.apiKeySource}
			envVar={view.llm.apiKeyVar}
			bind:value={store.form.apiKey}
			bind:cleared={store.form.apiKeyCleared}
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

	select,
	input {
		font: inherit;
		padding: var(--space-2) var(--space-3);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		background: var(--bg);
		color: var(--text);
	}
</style>

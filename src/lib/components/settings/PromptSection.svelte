<script lang="ts">
	import { settingsStore } from '$lib/settings/settings.svelte';
	import SettingsSection from './SettingsSection.svelte';

	const store = settingsStore;
</script>

<SettingsSection
	title="Systemprompt"
	description="Grundprompten är fast och beskriver vad assistenten är och vilka verktyg den har. Dina extra instruktioner läggs till sist."
>
	<details>
		<summary>Visa grundprompten</summary>
		<pre>{store.view?.corePrompt ?? ''}</pre>
	</details>

	<label for="extra-instructions">Extra instruktioner</label>
	<textarea
		id="extra-instructions"
		rows="6"
		placeholder="T.ex. “Svara kortfattat och föreslå alltid ett vegetariskt alternativ.”"
		bind:value={store.form.extraInstructions}></textarea>
</SettingsSection>

<style>
	details {
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		padding: var(--space-2) var(--space-3);
	}

	summary {
		cursor: pointer;
		font-size: var(--text-sm);
		font-weight: 600;
	}

	pre {
		margin: var(--space-3) 0 0;
		max-height: 22rem;
		overflow: auto;
		white-space: pre-wrap;
		font-size: var(--text-sm);
		color: var(--muted);
	}

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

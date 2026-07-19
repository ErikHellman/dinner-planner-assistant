<script lang="ts">
	import { settingsStore } from '$lib/settings/settings.svelte';
	import Banner from '../ui/Banner.svelte';
	import Icon from '../icons/Icon.svelte';
	import Spinner from '../ui/Spinner.svelte';
	import PromptSection from './PromptSection.svelte';
	import PreferencesSection from './PreferencesSection.svelte';
	import LlmSection from './LlmSection.svelte';
	import WillysSection from './WillysSection.svelte';

	const store = settingsStore;
	/** Saving restarts the agent, so it takes a second, deliberate click. */
	let confirming = $state(false);

	async function save() {
		confirming = false;
		await store.save();
	}
</script>

<div class="page">
	<header>
		<h1>Inställningar</h1>
	</header>

	<div class="content">
		<div class="column">
			{#if store.error}
				<Banner variant="error">{store.error}</Banner>
			{/if}

			{#if store.view?.secretError}
				<Banner variant="warning">
					{store.view.secretError}
				</Banner>
			{/if}

			{#if store.status === 'loading' && !store.view}
				<div class="center"><Spinner label="Hämtar inställningar…" /></div>
			{:else if store.view}
				<PromptSection />
				<PreferencesSection />
				<LlmSection />
				<WillysSection />
			{/if}
		</div>
	</div>

	{#if store.view}
		<div class="savebar">
			<div class="column savebar-inner">
				<p class="state">
					{#if store.saving}
						<Spinner label="Sparar…" />
					{:else if confirming}
						<Icon name="warning" size={16} />
						Detta startar om chatten och rensar konversationen.
					{:else if store.saved}
						<Icon name="check" size={16} />
						Sparat. Chatten har startats om.
					{:else if store.dirty}
						Osparade ändringar.
					{/if}
				</p>

				<div class="actions">
					{#if confirming}
						<button type="button" class="ghost" onclick={() => (confirming = false)}>Avbryt</button>
						<button type="button" class="primary" onclick={save}>Spara ändå</button>
					{:else}
						{#if store.dirty}
							<button type="button" class="ghost" onclick={() => store.reset()}>Återställ</button>
						{/if}
						<button
							type="button"
							class="primary"
							disabled={!store.dirty || store.saving}
							onclick={() => (confirming = true)}
						>
							Spara
						</button>
					{/if}
				</div>
			</div>
		</div>
	{/if}
</div>

<style>
	.page {
		flex: 1;
		min-height: 0;
		display: flex;
		flex-direction: column;
	}

	header {
		display: flex;
		align-items: center;
		gap: var(--space-4);
		padding: var(--space-3) var(--space-4);
		border-bottom: 1px solid var(--border);
		background: var(--surface);
	}

	h1 {
		font-size: var(--text-lg);
		margin: 0;
	}

	.content {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
	}

	.column {
		max-width: 52rem;
		margin: 0 auto;
		padding: var(--space-4);
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}

	.center {
		display: flex;
		justify-content: center;
		padding: var(--space-7) 0;
	}

	.savebar {
		flex-shrink: 0;
		border-top: 1px solid var(--border);
		background: var(--surface);
	}

	.savebar-inner {
		flex-direction: row;
		align-items: center;
		justify-content: space-between;
		padding: var(--space-3) var(--space-4);
		gap: var(--space-3);
	}

	.state {
		margin: 0;
		display: flex;
		align-items: center;
		gap: 0.35rem;
		font-size: var(--text-sm);
		color: var(--muted);
	}

	.actions {
		display: flex;
		gap: var(--space-2);
		flex-shrink: 0;
	}

	button {
		font: inherit;
		font-size: var(--text-sm);
		border-radius: var(--radius-sm);
		padding: 0.45rem 0.9rem;
		cursor: pointer;
	}

	.ghost {
		background: none;
		border: 1px solid var(--border);
		color: var(--text);
	}

	.primary {
		background: var(--accent);
		border: 1px solid var(--accent);
		color: var(--accent-contrast);
		font-weight: 600;
	}

	button:disabled {
		opacity: 0.5;
		cursor: default;
	}
</style>

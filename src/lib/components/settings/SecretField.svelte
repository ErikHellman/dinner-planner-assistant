<script lang="ts">
	import type { SettingsSource } from '$lib/settings/types';
	import Icon, { type IconName } from '../icons/Icon.svelte';

	let {
		id,
		label,
		source,
		envVar,
		placeholder = 'Skriv för att ändra',
		value = $bindable(''),
		cleared = $bindable(false)
	}: {
		id: string;
		label: string;
		source: SettingsSource;
		envVar?: string;
		placeholder?: string;
		value?: string;
		cleared?: boolean;
	} = $props();

	// Status is spelled out in words and marked with an icon — never colour alone.
	const STATUS: Record<SettingsSource, { icon: IconName; text: string }> = {
		settings: { icon: 'check', text: 'Sparad här' },
		env: { icon: 'info', text: 'Hämtas från .env' },
		none: { icon: 'warning', text: 'Saknas' }
	};
	const status = $derived(
		cleared ? { icon: 'trash' as IconName, text: 'Tas bort' } : STATUS[source]
	);
	const stored = $derived(source === 'settings');
</script>

<div class="field">
	<label for={id}>{label}</label>
	<span class="status">
		<Icon name={status.icon} size={16} />
		{status.text}{#if source === 'env' && envVar}&nbsp;({envVar}){/if}
	</span>
	<input
		{id}
		type="password"
		autocomplete="off"
		{placeholder}
		disabled={cleared}
		bind:value
		oninput={() => (cleared = false)}
	/>
	{#if stored || cleared}
		<button type="button" onclick={() => ((cleared = !cleared), (value = ''))}>
			{cleared ? 'Behåll sparat värde' : 'Ta bort sparat värde'}
		</button>
	{/if}
</div>

<style>
	.field {
		display: grid;
		grid-template-columns: 1fr auto;
		gap: var(--space-2);
		align-items: center;
	}

	label {
		font-size: var(--text-sm);
		font-weight: 600;
	}

	.status {
		display: inline-flex;
		align-items: center;
		gap: 0.3rem;
		font-size: var(--text-sm);
		color: var(--muted);
		justify-self: end;
	}

	input {
		grid-column: 1 / -1;
		font: inherit;
		padding: var(--space-2) var(--space-3);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		background: var(--bg);
		color: var(--text);
	}

	input:disabled {
		opacity: 0.5;
	}

	button {
		grid-column: 1 / -1;
		justify-self: start;
		font: inherit;
		font-size: var(--text-sm);
		background: none;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		padding: 0.3rem 0.7rem;
		color: var(--text);
		cursor: pointer;
	}
</style>

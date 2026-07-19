<script lang="ts">
	import { onMount } from 'svelte';
	import { settingsStore } from '$lib/settings/settings.svelte';
	import SettingsView from '$lib/components/settings/SettingsView.svelte';

	// Refetch on mount: the effective values depend on .env and on the agent's
	// state, and unsaved edits are cheap to lose compared to showing stale ones.
	onMount(() => {
		if (!settingsStore.view) settingsStore.load();
	});
</script>

<svelte:head>
	<title>Inställningar – Middagsplaneraren</title>
</svelte:head>

<SettingsView />

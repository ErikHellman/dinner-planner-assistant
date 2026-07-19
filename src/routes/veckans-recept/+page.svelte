<script lang="ts">
	import { onMount } from 'svelte';
	import { planViewStore } from '$lib/plans/plan-view.svelte';
	import PlanView from '$lib/components/plan/PlanView.svelte';

	// Always refetch on mount: the agent rewrites plan documents mid-chat.
	onMount(() => {
		planViewStore.load();
	});
</script>

<svelte:head>
	<title>Veckans recept – Middagsplaneraren</title>
</svelte:head>

<PlanView />

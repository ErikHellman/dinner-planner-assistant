<script lang="ts">
	import '../app.css';
	import favicon from '$lib/assets/favicon.svg';
	import TabBar from '$lib/components/TabBar.svelte';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

<div class="shell">
	<TabBar />
	<main>{@render children()}</main>
</div>

<style>
	.shell {
		height: 100dvh;
		display: flex;
		flex-direction: column;
	}

	/* TabBar orders itself (bottom on mobile, top on desktop); main sits between. */
	main {
		order: 1;
		flex: 1;
		min-height: 0;
		display: flex;
		flex-direction: column;
	}

	/* Print: let the content paginate instead of being clipped to one viewport. */
	@media print {
		.shell {
			height: auto;
			display: block;
		}

		main {
			display: block;
			min-height: 0;
		}
	}
</style>

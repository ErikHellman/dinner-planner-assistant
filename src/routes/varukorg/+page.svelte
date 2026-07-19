<script lang="ts">
	import { onMount } from 'svelte';
	import { cartStore } from '$lib/cart/cart.svelte';
	import CartView from '$lib/components/cart/CartView.svelte';

	// Refetch on every visit: the agent (or willys.se itself) may have changed
	// the cart since last time. Existing lines stay visible while reloading.
	onMount(() => {
		cartStore.load();
	});
</script>

<svelte:head>
	<title>Varukorg – Middagsplaneraren</title>
</svelte:head>

<CartView />

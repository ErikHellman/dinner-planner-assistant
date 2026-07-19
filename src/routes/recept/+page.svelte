<script lang="ts">
	import { onMount } from 'svelte';
	import { browseStore } from '$lib/recipes/browse.svelte';
	import { verdictStore } from '$lib/verdicts/verdicts.svelte';
	import RecipeCard from '$lib/components/recipes/RecipeCard.svelte';
	import Banner from '$lib/components/ui/Banner.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import Spinner from '$lib/components/ui/Spinner.svelte';
	import Icon from '$lib/components/icons/Icon.svelte';

	onMount(() => {
		browseStore.load();
		verdictStore.load();
	});
</script>

<svelte:head>
	<title>Alla recept – Middagsplaneraren</title>
</svelte:head>

<div class="page">
	<header>
		<h1>Alla recept</h1>
		<label class="search">
			<Icon name="search" size={16} />
			<span class="sr-only">Sök recept</span>
			<input type="search" placeholder="Sök recept…" bind:value={browseStore.filter} />
		</label>
	</header>

	<div class="content">
		{#if browseStore.error}
			<div class="pad"><Banner variant="error">{browseStore.error}</Banner></div>
		{:else if browseStore.status === 'loading' && browseStore.recipes.length === 0}
			<div class="center"><Spinner label="Hämtar recept…" /></div>
		{:else if browseStore.filtered.length === 0}
			<EmptyState icon="search" title="Inga recept matchar sökningen">
				<p>Prova ett annat sökord, t.ex. en ingrediens eller kategori.</p>
			</EmptyState>
		{:else}
			<p class="count" aria-live="polite">{browseStore.filtered.length} recept</p>
			<div class="grid">
				{#each browseStore.filtered as recipe (recipe.recipeId)}
					<RecipeCard {recipe} />
				{/each}
			</div>
		{/if}
	</div>
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
		justify-content: space-between;
		gap: var(--space-4);
		padding: var(--space-3) var(--space-4);
		border-bottom: 1px solid var(--border);
		background: var(--surface);
	}

	h1 {
		font-size: var(--text-lg);
		margin: 0;
	}

	.search {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		flex: 1;
		max-width: 20rem;
		background: var(--bg);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		padding: 0.4rem 0.8rem;
		color: var(--muted);
	}

	.search:focus-within {
		outline: 3px solid var(--focus);
		outline-offset: 2px;
	}

	.search input {
		flex: 1;
		min-width: 0;
		border: none;
		background: none;
		font: inherit;
		color: var(--text);
	}

	.search input:focus-visible {
		outline: none; /* the wrapping label carries the focus ring */
	}

	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip-path: inset(50%);
		white-space: nowrap;
	}

	.content {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
		padding: var(--space-4);
	}

	.pad {
		max-width: 44rem;
		margin: 0 auto;
	}

	.center {
		display: flex;
		justify-content: center;
		padding: var(--space-7) 0;
	}

	.count {
		margin: 0 0 var(--space-3);
		font-size: var(--text-sm);
		color: var(--muted);
	}

	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
		gap: var(--space-3);
	}

	@media (min-width: 768px) {
		.grid {
			grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
			gap: var(--space-4);
		}
	}
</style>

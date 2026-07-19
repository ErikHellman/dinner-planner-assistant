<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { ApiError, apiFetch, messageFor } from '$lib/api/client';
	import RecipeDetail from '$lib/components/recipes/RecipeDetail.svelte';
	import Banner from '$lib/components/ui/Banner.svelte';
	import EmptyState from '$lib/components/ui/EmptyState.svelte';
	import Spinner from '$lib/components/ui/Spinner.svelte';
	import Icon from '$lib/components/icons/Icon.svelte';
	import type { RecipeDetails } from '$lib/recipes/types';

	let recipe = $state.raw<RecipeDetails | null>(null);
	let notFound = $state(false);
	let error = $state<string | null>(null);
	let loading = $state(false);

	// $effect re-runs on client-side navigation between recipe ids.
	$effect(() => {
		const id = page.params.id;
		recipe = null;
		notFound = false;
		error = null;
		loading = true;
		apiFetch<RecipeDetails>(`/api/recipes/${id}`)
			.then((doc) => (recipe = doc))
			.catch((err: unknown) => {
				if (err instanceof ApiError && err.status === 404) notFound = true;
				else error = messageFor(err);
			})
			.finally(() => (loading = false));
	});
</script>

<svelte:head>
	<title>{recipe ? recipe.name : 'Recept'} – Middagsplaneraren</title>
</svelte:head>

<div class="page">
	<header>
		<a class="back" href={resolve('/recept')}>
			<Icon name="chevron-left" size={16} />
			Alla recept
		</a>
		{#if recipe}
			<button class="print" type="button" onclick={() => window.print()}>
				<Icon name="printer" size={16} />
				Skriv ut
			</button>
		{/if}
	</header>

	<div class="content">
		{#if loading}
			<div class="center"><Spinner label="Hämtar receptet…" /></div>
		{:else if notFound}
			<EmptyState icon="search" title="Receptet hittades inte">
				<p>Det kan ha försvunnit vid en uppdatering av receptdatabasen.</p>
			</EmptyState>
		{:else if error}
			<div class="pad"><Banner variant="error">{error}</Banner></div>
		{:else if recipe}
			<RecipeDetail {recipe} />
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
		padding: var(--space-2) var(--space-4);
		border-bottom: 1px solid var(--border);
		background: var(--surface);
	}

	.back {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		color: var(--text);
		text-decoration: none;
		font-size: var(--text-sm);
		font-weight: 600;
		padding: var(--space-1) var(--space-2);
		margin-left: calc(-1 * var(--space-2));
		border-radius: var(--radius-sm);
	}

	.back:hover {
		background: var(--surface-2);
	}

	.print {
		margin-left: auto;
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
		font: inherit;
		font-size: var(--text-sm);
		font-weight: 600;
		color: var(--text);
		background: none;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		padding: var(--space-1) var(--space-3);
		cursor: pointer;
	}

	.print:hover {
		background: var(--surface-2);
	}

	.content {
		flex: 1;
		min-height: 0;
		overflow-y: auto;
	}

	.pad {
		max-width: 44rem;
		margin: var(--space-4) auto 0;
		padding: 0 var(--space-4);
	}

	.center {
		display: flex;
		justify-content: center;
		padding: var(--space-7) 0;
	}

	@media print {
		header {
			display: none;
		}

		.page {
			display: block;
		}

		.content {
			overflow: visible;
			min-height: 0;
		}
	}
</style>

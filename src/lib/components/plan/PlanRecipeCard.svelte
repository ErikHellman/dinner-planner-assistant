<script lang="ts">
	import type { PlanRecipeView } from '$lib/plans/types';
	import RecipeCard from '../recipes/RecipeCard.svelte';
	import Icon from '../icons/Icon.svelte';

	let { recipe, ordinal }: { recipe: PlanRecipeView; ordinal: number } = $props();
</script>

<div class="wrap">
	<span class="ordinal" aria-label="Recept {ordinal}">{ordinal}</span>
	{#if recipe.exists}
		<RecipeCard
			recipe={{
				recipeId: recipe.recipeId,
				name: recipe.name,
				headline: recipe.headline,
				mainIngredient: recipe.mainIngredient,
				categories: [],
				cookingTime: recipe.cookingTime ?? { min: null, max: null },
				energyKcalPerServing: recipe.energyKcalPerServing,
				rating: recipe.rating ?? { average: null, count: null },
				imageSmall: recipe.imageSmall
			}}
		/>
	{:else}
		<div class="missing">
			<span class="noimg" aria-hidden="true"><Icon name="book" size={28} /></span>
			<div>
				<p class="name">{recipe.name}</p>
				<p class="note">Finns inte längre i receptdatabasen</p>
			</div>
		</div>
	{/if}
</div>

<style>
	.wrap {
		position: relative;
	}

	.ordinal {
		position: absolute;
		top: var(--space-2);
		left: var(--space-2);
		z-index: 1;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 1.6rem;
		height: 1.6rem;
		border-radius: 50%;
		background: var(--surface);
		border: 1px solid var(--border);
		box-shadow: var(--shadow-1);
		font-size: var(--text-sm);
		font-weight: 700;
	}

	.missing {
		display: flex;
		gap: var(--space-3);
		align-items: center;
		background: var(--surface);
		border: 1px dashed var(--border);
		border-radius: var(--radius);
		padding: var(--space-4);
		height: 100%;
	}

	.noimg {
		display: inline-flex;
		color: var(--muted);
	}

	.name {
		margin: 0;
		font-weight: 600;
		font-size: var(--text-sm);
	}

	.note {
		margin: var(--space-1) 0 0;
		font-size: 0.75rem;
		color: var(--muted);
	}
</style>

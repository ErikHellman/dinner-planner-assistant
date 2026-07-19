<script lang="ts">
	import { resolve } from '$app/paths';
	import type { BrowseRecipe } from '$lib/recipes/types';
	import Icon from '../icons/Icon.svelte';

	let { recipe }: { recipe: BrowseRecipe } = $props();

	const ratingFormat = new Intl.NumberFormat('sv-SE', {
		minimumFractionDigits: 1,
		maximumFractionDigits: 1
	});

	const time = $derived.by(() => {
		const { min, max } = recipe.cookingTime;
		if (min !== null && max !== null && min !== max) return `${min}–${max} min`;
		const single = max ?? min;
		return single !== null ? `${single} min` : null;
	});

	const facts = $derived(
		[time, recipe.energyKcalPerServing !== null ? `${recipe.energyKcalPerServing} kcal` : null]
			.filter(Boolean)
			.join(' · ')
	);
</script>

<a class="card" href={resolve('/recept/[id]', { id: String(recipe.recipeId) })}>
	{#if recipe.imageSmall}
		<img src={recipe.imageSmall} alt="" loading="lazy" />
	{:else}
		<span class="noimg" aria-hidden="true"><Icon name="book" size={32} /></span>
	{/if}
	<div class="body">
		<p class="name">{recipe.name}</p>
		{#if facts}
			<p class="facts">{facts}</p>
		{/if}
		{#if recipe.rating.average !== null}
			<p class="rating">
				<Icon name="star" size={14} />
				{ratingFormat.format(recipe.rating.average)}
				{#if recipe.rating.count !== null}
					<span class="count">({recipe.rating.count})</span>
				{/if}
			</p>
		{/if}
	</div>
</a>

<style>
	.card {
		display: flex;
		flex-direction: column;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius);
		box-shadow: var(--shadow-1);
		overflow: hidden;
		text-decoration: none;
		color: var(--text);
		transition: transform 120ms ease;
	}

	.card:hover {
		transform: translateY(-2px);
	}

	img,
	.noimg {
		width: 100%;
		aspect-ratio: 3 / 2;
		object-fit: cover;
		/* Portrait 2:3 source images: crop to a landscape card header, biased
		   toward the top where the plated dish sits. */
		object-position: top;
		background: var(--surface-2);
	}

	.noimg {
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--muted);
	}

	.body {
		display: flex;
		flex-direction: column;
		gap: var(--space-1);
		padding: var(--space-3);
	}

	.name {
		margin: 0;
		font-weight: 600;
		font-size: var(--text-sm);
		line-height: 1.35;
		display: -webkit-box;
		-webkit-line-clamp: 3;
		line-clamp: 3;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}

	.facts,
	.rating {
		margin: 0;
		font-size: 0.75rem;
		color: var(--muted);
	}

	.rating {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
	}

	.count {
		color: var(--muted);
	}
</style>

<script lang="ts">
	import { planViewStore } from '$lib/plans/plan-view.svelte';
	import Banner from '../ui/Banner.svelte';
	import EmptyState from '../ui/EmptyState.svelte';
	import Spinner from '../ui/Spinner.svelte';
	import WeekSwitcher from './WeekSwitcher.svelte';
	import PlanRecipeCard from './PlanRecipeCard.svelte';
	import PlanStatusBar from './PlanStatusBar.svelte';
	import ShoppingListSection from './ShoppingListSection.svelte';
	import CartSnapshotSection from './CartSnapshotSection.svelte';

	const store = planViewStore;
	const plan = $derived(store.plan);

	const generatedAt = new Intl.DateTimeFormat('sv-SE', {
		dateStyle: 'medium',
		timeStyle: 'short'
	});

	/** 1-based ordinal per plan entry; duplicates of the same recipe share one. */
	const ordinals = $derived.by(() => {
		const byRecipe: Record<number, number> = {};
		let next = 1;
		for (const recipe of plan?.recipes ?? []) {
			byRecipe[recipe.recipeId] ??= next++;
		}
		return byRecipe;
	});
</script>

<div class="page">
	<header>
		<h1>Veckans recept</h1>
	</header>

	<div class="content">
		<div class="column">
			<WeekSwitcher
				week={store.selectedWeek}
				disabled={store.status === 'loading'}
				onprevious={() => store.previousWeek()}
				onnext={() => store.nextWeek()}
				oncurrent={() => store.goToCurrentWeek()}
			/>

			{#if store.error}
				<Banner variant="error">{store.error}</Banner>
			{:else if store.status === 'loading' && !plan}
				<div class="center"><Spinner label="Hämtar veckans plan…" /></div>
			{:else if !plan}
				<EmptyState icon="calendar" title="Ingen plan för den här veckan ännu">
					<p>Be assistenten planera veckan under fliken Planera.</p>
				</EmptyState>
			{:else}
				<PlanStatusBar
					status={plan.status}
					busy={store.saving}
					onchange={(next) => store.setStatus(next)}
				/>

				<p class="summary">
					{plan.recipes.length} recept · {plan.servings} portioner per rätt · Skapad
					{generatedAt.format(new Date(plan.generatedAt))}
				</p>

				<div class="grid">
					{#each store.recipes as recipe, i (i)}
						<PlanRecipeCard {recipe} ordinal={ordinals[recipe.recipeId] ?? i + 1} />
					{/each}
				</div>

				<ShoppingListSection title="Inköpslista" items={plan.shoppingList.items} {ordinals} />

				{#if plan.shoppingList.pantryStaples.length > 0}
					<ShoppingListSection
						title="Basvaror"
						note="Antas finnas hemma — ingår inte i inköpslistan."
						items={plan.shoppingList.pantryStaples}
						{ordinals}
					/>
				{/if}

				{#if plan.willysCart}
					<CartSnapshotSection snapshot={plan.willysCart} />
				{:else}
					<Banner variant="info">
						Inga Willys-produkter är registrerade för den här veckan ännu. Be assistenten fylla
						varukorgen och spara den i planen.
					</Banner>
				{/if}
			{/if}
		</div>
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

	.summary {
		margin: 0;
		color: var(--muted);
		font-size: var(--text-sm);
	}

	.grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
		gap: var(--space-3);
	}

	@media (min-width: 640px) {
		.grid {
			grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
			gap: var(--space-4);
		}
	}
</style>

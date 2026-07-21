<script lang="ts">
	import type { RecipeDetails } from '$lib/recipes/types';
	import Icon from '../icons/Icon.svelte';
	import VerdictButtons from './VerdictButtons.svelte';

	let { recipe }: { recipe: RecipeDetails } = $props();

	const ratingFormat = new Intl.NumberFormat('sv-SE', {
		minimumFractionDigits: 1,
		maximumFractionDigits: 1
	});
	const dateFormat = new Intl.DateTimeFormat('sv-SE', { dateStyle: 'medium' });

	const time = $derived.by(() => {
		const { min, max } = recipe.cookingTime;
		if (min !== null && max !== null && min !== max) return `${min}–${max} min`;
		const single = max ?? min;
		return single !== null ? `${single} min` : null;
	});

	interface IngredientSection {
		title: string | null;
		rows: RecipeDetails['ingredients'];
	}

	const ingredientSections = $derived.by(() => {
		const sections: IngredientSection[] = [];
		for (const row of recipe.ingredients) {
			const last = sections.at(-1);
			if (last && last.title === row.section) last.rows.push(row);
			else sections.push({ title: row.section, rows: [row] });
		}
		return sections;
	});

	// Per-taste ingredients are stored as { amount: null, unit: null, raw: name };
	// rows with unparseable-but-real amounts ("½-1 klyfta vitlök") keep their unit
	// and must not get the suffix.
	function ingredientLabel(row: RecipeDetails['ingredients'][number]): string {
		const toTaste = row.amount === null && row.unit === null ? ' (efter smak)' : '';
		return `${row.raw}${toTaste}${row.isBasis ? ' *' : ''}`;
	}

	const grams = new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 1 });

	const nutritionRows = $derived.by(() => {
		const n = recipe.nutritionPerServing;
		if (!n) return [];
		return [
			{ label: 'Energi', value: `${n.energyKcal} kcal` },
			n.protein !== null ? { label: 'Protein', value: `${grams.format(n.protein)} g` } : null,
			n.carbs !== null ? { label: 'Kolhydrater', value: `${grams.format(n.carbs)} g` } : null,
			n.fat !== null ? { label: 'Fett', value: `${grams.format(n.fat)} g` } : null
		].filter((row) => row !== null);
	});
</script>

<article>
	{#if recipe.imageLarge}
		<img class="hero" src={recipe.imageLarge} alt="" />
	{/if}

	<div class="body">
		<h1>{recipe.name}</h1>
		{#if recipe.subheadline}
			<p class="subheadline">{recipe.subheadline}</p>
		{/if}

		<ul class="facts">
			{#if time}
				<li>{time}</li>
			{/if}
			{#if recipe.nutritionPerServing}
				<li>{recipe.nutritionPerServing.energyKcal} kcal/portion</li>
			{/if}
			{#if recipe.co2eKgPerServing !== null}
				<li class="co2">{String(recipe.co2eKgPerServing).replace('.', ',')} kg CO₂e/portion</li>
			{/if}
			{#if recipe.rating.average !== null}
				<li class="rating">
					<Icon name="star" size={14} />
					{ratingFormat.format(recipe.rating.average)}
					{#if recipe.rating.count !== null}({recipe.rating.count} betyg){/if}
				</li>
			{/if}
		</ul>

		<div class="verdicts">
			<VerdictButtons recipeId={recipe.recipeId} />
		</div>

		{#if recipe.categories.length > 0}
			<ul class="chips">
				{#each recipe.categories as category (category)}
					<li>{category}</li>
				{/each}
			</ul>
		{/if}

		{#if recipe.description}
			<p class="description">{recipe.description}</p>
		{/if}

		{#if recipe.allergies.length > 0}
			<p class="allergies">
				<Icon name="warning" size={16} />
				<span><strong>Allergener:</strong> {recipe.allergies.join(', ')}</span>
			</p>
		{/if}

		{#if recipe.chefTip}
			<aside class="tip">
				<p class="tip-title">Kockens tips</p>
				<p>{recipe.chefTip}</p>
			</aside>
		{/if}

		<div class="columns">
			<section aria-labelledby="ingredients-title">
				<h2 id="ingredients-title">Ingredienser <span class="note">(2 portioner)</span></h2>
				{#each ingredientSections as section, i (i)}
					{#if section.title}
						<h3>{section.title}</h3>
					{/if}
					<ul class="ingredients">
						{#each section.rows as row, rowIndex (rowIndex)}
							<li>{ingredientLabel(row)}</li>
						{/each}
					</ul>
				{/each}
				<p class="note">* basvara — antas finnas hemma</p>
			</section>

			<section aria-labelledby="instructions-title">
				<h2 id="instructions-title">Gör så här</h2>
				<ol class="instructions">
					{#each recipe.instructions as instruction (instruction.step)}
						<li>
							{#if instruction.section}
								<span class="step-section">{instruction.section}</span>
							{/if}
							{instruction.text}
						</li>
					{/each}
				</ol>
			</section>
		</div>

		{#if nutritionRows.length > 0}
			<section class="nutrition-section" aria-labelledby="nutrition-title">
				<h2 id="nutrition-title">Näring per portion</h2>
				<dl class="nutrition">
					{#each nutritionRows as row (row.label)}
						<div>
							<dt>{row.label}</dt>
							<dd>{row.value}</dd>
						</div>
					{/each}
				</dl>
			</section>
		{/if}

		<p class="source">
			Källa:
			<!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- external URL from the recipe doc -->
			<a href={recipe.source.url} target="_blank" rel="noopener noreferrer">
				linasmatkasse.se <Icon name="external" size={12} />
			</a>
			· hämtat {dateFormat.format(new Date(recipe.source.harvestedAt))}
		</p>
	</div>
</article>

<style>
	article {
		max-width: 52rem;
		margin: 0 auto;
		padding-bottom: var(--space-6);
	}

	.hero {
		width: 100%;
		max-height: 22rem;
		object-fit: cover;
		object-position: top;
		border-radius: 0 0 var(--radius) var(--radius);
		background: var(--surface-2);
	}

	.body {
		padding: 0 var(--space-4);
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}

	h1 {
		margin: var(--space-4) 0 0;
		font-size: var(--text-2xl);
		line-height: 1.2;
	}

	.subheadline {
		margin: calc(-1 * var(--space-3)) 0 0;
		color: var(--muted);
		font-size: var(--text-lg);
	}

	.facts {
		list-style: none;
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2) var(--space-4);
		margin: 0;
		padding: 0;
		color: var(--muted);
		font-size: var(--text-sm);
	}

	.rating {
		display: inline-flex;
		align-items: center;
		gap: var(--space-1);
	}

	.verdicts {
		margin: var(--space-1) 0;
	}

	.chips {
		list-style: none;
		display: flex;
		flex-wrap: wrap;
		gap: var(--space-2);
		margin: 0;
		padding: 0;
	}

	.chips li {
		background: var(--surface-2);
		border-radius: var(--radius-sm);
		padding: 0.2rem 0.6rem;
		font-size: 0.75rem;
	}

	.description {
		margin: 0;
		line-height: 1.55;
	}

	.allergies {
		display: flex;
		align-items: flex-start;
		gap: var(--space-2);
		margin: 0;
		padding: var(--space-3) var(--space-4);
		background: var(--warning-bg);
		color: var(--warning-text);
		border-radius: var(--radius-sm);
		font-size: var(--text-sm);
	}

	.tip {
		margin: 0;
		padding: var(--space-3) var(--space-4);
		background: var(--info-bg);
		color: var(--text);
		border-radius: var(--radius-sm);
		font-size: var(--text-sm);
	}

	.tip p {
		margin: 0;
	}

	.tip-title {
		font-weight: 700;
		color: var(--info);
		margin-bottom: var(--space-1);
	}

	.columns {
		display: grid;
		grid-template-columns: 1fr;
		gap: var(--space-5);
	}

	@media (min-width: 640px) {
		.columns {
			grid-template-columns: minmax(14rem, 1fr) 2fr;
		}
	}

	h2 {
		font-size: var(--text-lg);
		margin: 0 0 var(--space-2);
	}

	h3 {
		font-size: var(--text-sm);
		text-transform: uppercase;
		letter-spacing: 0.03em;
		color: var(--muted);
		margin: var(--space-3) 0 var(--space-1);
	}

	.ingredients {
		list-style: none;
		margin: 0;
		padding: 0;
	}

	.ingredients li {
		padding: var(--space-1) 0;
		border-bottom: 1px solid var(--border);
		font-size: var(--text-sm);
	}

	.note {
		color: var(--muted);
		font-size: 0.75rem;
		font-weight: 400;
	}

	.instructions {
		margin: 0;
		padding-left: 1.4rem;
		display: flex;
		flex-direction: column;
		gap: var(--space-3);
		line-height: 1.55;
	}

	.step-section {
		display: block;
		font-weight: 700;
		font-size: var(--text-sm);
	}

	.nutrition {
		margin: 0;
		max-width: 20rem;
	}

	.nutrition div {
		display: flex;
		justify-content: space-between;
		padding: var(--space-1) 0;
		border-bottom: 1px solid var(--border);
		font-size: var(--text-sm);
	}

	.nutrition dt {
		color: var(--muted);
	}

	.nutrition dd {
		margin: 0;
		font-variant-numeric: tabular-nums;
	}

	.source {
		margin: 0;
		color: var(--muted);
		font-size: 0.75rem;
	}

	.source a {
		color: var(--info);
		display: inline-flex;
		align-items: center;
		gap: 2px;
	}

	/* Print: black & white A4 sheet with just the cooking essentials — no photo,
	   chips, rating, description, tips, nutrition table or source line. */
	@media print {
		.hero,
		.verdicts,
		.chips,
		.rating,
		.co2,
		.description,
		.tip,
		.nutrition-section,
		.source {
			display: none;
		}

		article {
			max-width: none;
			padding-bottom: 0;
		}

		.body {
			padding: 0;
			gap: var(--space-3);
		}

		h1 {
			margin-top: 0;
			font-size: 20pt;
		}

		.subheadline {
			font-size: 12pt;
		}

		.allergies {
			padding: var(--space-2);
			border: 1px solid #000;
			font-weight: 600;
		}

		.columns {
			grid-template-columns: minmax(55mm, 1fr) 2fr;
			gap: var(--space-5);
		}

		h1,
		h2,
		h3 {
			break-after: avoid;
		}

		.ingredients li,
		.instructions li {
			break-inside: avoid;
		}
	}
</style>

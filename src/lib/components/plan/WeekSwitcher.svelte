<script lang="ts">
	import { currentWeekId, parseWeekId, weekRange } from '$lib/plans/week';
	import Icon from '../icons/Icon.svelte';

	let {
		week,
		disabled = false,
		onprevious,
		onnext,
		oncurrent
	}: {
		week: string;
		disabled?: boolean;
		onprevious: () => void;
		onnext: () => void;
		oncurrent: () => void;
	} = $props();

	const dayMonth = new Intl.DateTimeFormat('sv-SE', { day: 'numeric', month: 'long' });

	const label = $derived.by(() => {
		const parsed = parseWeekId(week);
		if (!parsed) return week;
		const { start, end } = weekRange(week);
		const startDate = new Date(`${start}T00:00:00`);
		const endDate = new Date(`${end}T00:00:00`);
		const range =
			startDate.getMonth() === endDate.getMonth()
				? `${startDate.getDate()}–${dayMonth.format(endDate)}`
				: `${dayMonth.format(startDate)} – ${dayMonth.format(endDate)}`;
		return `Vecka ${parsed.week} · ${range} ${parsed.year}`;
	});

	const isCurrent = $derived(week === currentWeekId());
</script>

<div class="switcher">
	<button type="button" onclick={onprevious} {disabled} aria-label="Föregående vecka">
		<Icon name="chevron-left" size={18} />
	</button>
	<span class="label" aria-live="polite">{label}</span>
	<button type="button" onclick={onnext} {disabled} aria-label="Nästa vecka">
		<Icon name="chevron-right" size={18} />
	</button>
	{#if !isCurrent}
		<button type="button" class="today" onclick={oncurrent} {disabled}>Denna vecka</button>
	{/if}
</div>

<style>
	.switcher {
		display: flex;
		align-items: center;
		gap: var(--space-2);
		flex-wrap: wrap;
	}

	button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 2.5rem;
		height: 2.5rem;
		font: inherit;
		background: var(--surface);
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		color: var(--text);
		cursor: pointer;
	}

	button:hover:not(:disabled) {
		background: var(--surface-2);
	}

	button:disabled {
		opacity: 0.4;
		cursor: default;
	}

	.label {
		min-width: 13rem;
		text-align: center;
		font-weight: 600;
	}

	.today {
		width: auto;
		padding: 0 var(--space-3);
		font-size: var(--text-sm);
	}
</style>

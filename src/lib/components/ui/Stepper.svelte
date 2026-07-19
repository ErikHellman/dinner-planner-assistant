<script lang="ts">
	import Icon from '../icons/Icon.svelte';

	let {
		value,
		step = 1,
		unitLabel = '',
		name,
		disabled = false,
		onchange
	}: {
		value: number;
		step?: number;
		unitLabel?: string;
		/** What is being counted, for accessible button labels. */
		name: string;
		disabled?: boolean;
		onchange: (next: number) => void;
	} = $props();

	const formatter = new Intl.NumberFormat('sv-SE', { maximumFractionDigits: 2 });

	function decrease() {
		onchange(Math.max(0, Math.round((value - step) * 100) / 100));
	}

	function increase() {
		onchange(Math.round((value + step) * 100) / 100);
	}
</script>

<div class="stepper">
	<button type="button" onclick={decrease} {disabled} aria-label="Minska antal {name}">
		<Icon name="minus" size={16} />
	</button>
	<span class="value" aria-live="polite">
		{formatter.format(value)}{unitLabel ? ` ${unitLabel}` : ''}
	</span>
	<button type="button" onclick={increase} {disabled} aria-label="Öka antal {name}">
		<Icon name="plus" size={16} />
	</button>
</div>

<style>
	.stepper {
		display: inline-flex;
		align-items: center;
		border: 1px solid var(--border);
		border-radius: var(--radius-sm);
		background: var(--surface);
	}

	button {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 2.75rem; /* 44px touch target */
		height: 2.75rem;
		border: none;
		background: none;
		color: var(--text);
		cursor: pointer;
		border-radius: var(--radius-sm);
	}

	button:hover:not(:disabled) {
		background: var(--surface-2);
	}

	button:disabled {
		opacity: 0.4;
		cursor: default;
	}

	.value {
		min-width: 3rem;
		text-align: center;
		font-variant-numeric: tabular-nums;
		font-weight: 600;
		font-size: var(--text-sm);
	}
</style>

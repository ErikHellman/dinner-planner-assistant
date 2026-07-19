<script lang="ts">
	import type { Snippet } from 'svelte';
	import Icon, { type IconName } from '../icons/Icon.svelte';

	let {
		variant = 'info',
		children
	}: { variant?: 'error' | 'warning' | 'info'; children: Snippet } = $props();

	const ICONS: Record<'error' | 'warning' | 'info', IconName> = {
		error: 'warning',
		warning: 'warning',
		info: 'info'
	};
</script>

<div class={['banner', variant]} role={variant === 'error' ? 'alert' : 'status'}>
	<span class="icon"><Icon name={ICONS[variant]} size={18} /></span>
	<div class="body">{@render children()}</div>
</div>

<style>
	.banner {
		display: flex;
		align-items: flex-start;
		gap: var(--space-2);
		padding: var(--space-3) var(--space-4);
		border-radius: var(--radius-sm);
		font-size: var(--text-sm);
	}

	.icon {
		flex-shrink: 0;
		display: inline-flex;
		margin-top: 1px;
	}

	.error {
		background: var(--error-bg);
		color: var(--error);
	}

	.warning {
		background: var(--warning-bg);
		color: var(--warning-text);
	}

	.info {
		background: var(--info-bg);
		color: var(--info);
	}
</style>

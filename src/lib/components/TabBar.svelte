<script lang="ts">
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import Icon, { type IconName } from './icons/Icon.svelte';

	interface Tab {
		href: '/' | '/varukorg' | '/veckans-recept' | '/recept' | '/installningar';
		label: string;
		icon: IconName;
		exact?: boolean;
	}

	const tabs: Tab[] = [
		{ href: '/', label: 'Planera', icon: 'chat', exact: true },
		{ href: '/varukorg', label: 'Varukorg', icon: 'cart' },
		{ href: '/veckans-recept', label: 'Veckans recept', icon: 'calendar' },
		{ href: '/recept', label: 'Alla recept', icon: 'book' },
		{ href: '/installningar', label: 'Inställningar', icon: 'settings' }
	];

	function isActive(tab: Tab): boolean {
		const path = page.url.pathname;
		if (tab.exact) return path === tab.href;
		return path === tab.href || path.startsWith(tab.href + '/');
	}
</script>

<nav aria-label="Huvudmeny">
	<span class="brand">Middagsplaneraren</span>
	{#each tabs as tab (tab.href)}
		<a href={resolve(tab.href)} aria-current={isActive(tab) ? 'page' : undefined}>
			<Icon name={tab.icon} size={22} />
			<span class="label">{tab.label}</span>
		</a>
	{/each}
</nav>

<style>
	/* Mobile first: bottom navigation. The layout's flex column orders this after <main>. */
	nav {
		order: 2;
		flex-shrink: 0;
		display: flex;
		align-items: stretch;
		background: var(--surface);
		border-top: 1px solid var(--border);
		padding-bottom: env(safe-area-inset-bottom);
	}

	.brand {
		display: none;
	}

	a {
		/* Five tabs on a phone: sized to their label, sharing the slack evenly —
		   and on a very narrow screen they shrink and the label ellipsizes
		   instead of pushing the bar wider than the viewport. */
		flex: 1 1 auto;
		min-width: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 2px;
		min-height: var(--tabbar-h);
		padding: 0 var(--space-1);
		font-size: 0.7rem;
		text-decoration: none;
		color: var(--muted);
		/* Active state = color + weight + edge indicator, never color alone. */
		border-top: 3px solid transparent;
	}

	.label {
		max-width: 100%;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	a[aria-current='page'] {
		color: var(--accent);
		font-weight: 700;
		border-top-color: var(--accent);
	}

	@media (min-width: 768px) {
		nav {
			order: 0;
			align-items: center;
			justify-content: flex-start;
			gap: var(--space-2);
			border-top: none;
			border-bottom: 1px solid var(--border);
			padding: 0 var(--space-4);
		}

		.brand {
			display: block;
			font-size: var(--text-lg);
			font-weight: 700;
			margin-right: var(--space-5);
		}

		a {
			flex: none;
			flex-direction: row;
			gap: var(--space-2);
			min-height: var(--tabbar-h);
			padding: 0 var(--space-3);
			font-size: var(--text-sm);
			border-top: none;
			border-bottom: 3px solid transparent;
		}

		a[aria-current='page'] {
			border-bottom-color: var(--accent);
		}
	}

	@media print {
		nav {
			display: none;
		}
	}
</style>

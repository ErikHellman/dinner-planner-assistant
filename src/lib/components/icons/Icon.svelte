<script module lang="ts">
	export type IconName =
		| 'chat'
		| 'cart'
		| 'calendar'
		| 'book'
		| 'plus'
		| 'minus'
		| 'trash'
		| 'refresh'
		| 'external'
		| 'chevron-left'
		| 'chevron-right'
		| 'warning'
		| 'check'
		| 'search'
		| 'star'
		| 'info';

	// Feather-style 24x24 stroke paths; circles/points expressed as arc/dot paths.
	const PATHS: Record<IconName, string[]> = {
		chat: ['M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z'],
		cart: [
			'M9 21m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0',
			'M20 21m-1 0a1 1 0 1 0 2 0a1 1 0 1 0 -2 0',
			'M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6'
		],
		calendar: [
			'M3 6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
			'M16 2v4',
			'M8 2v4',
			'M3 10h18'
		],
		book: ['M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z', 'M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z'],
		plus: ['M12 5v14', 'M5 12h14'],
		minus: ['M5 12h14'],
		trash: [
			'M3 6h18',
			'M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6',
			'M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2',
			'M10 11v6',
			'M14 11v6'
		],
		refresh: [
			'M23 4v6h-6',
			'M1 20v-6h6',
			'M3.51 9a9 9 0 0 1 14.85-3.36L23 10',
			'M1 14l4.64 4.36A9 9 0 0 0 20.49 15'
		],
		external: ['M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6', 'M15 3h6v6', 'M10 14L21 3'],
		'chevron-left': ['M15 18l-6-6 6-6'],
		'chevron-right': ['M9 18l6-6-6-6'],
		warning: [
			'M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z',
			'M12 9v4',
			'M12 17h.01'
		],
		check: ['M20 6L9 17l-5-5'],
		search: ['M11 11m-8 0a8 8 0 1 0 16 0a8 8 0 1 0 -16 0', 'M21 21l-4.35-4.35'],
		star: ['M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 21 12 17.77 5.82 21 7 14.14 2 9.27l6.91-1.01z'],
		info: ['M12 12m-10 0a10 10 0 1 0 20 0a10 10 0 1 0 -20 0', 'M12 16v-4', 'M12 8h.01']
	};

	const FILLED = new Set<IconName>(['star']);
</script>

<script lang="ts">
	let { name, size = 20 }: { name: IconName; size?: number } = $props();
</script>

<svg
	width={size}
	height={size}
	viewBox="0 0 24 24"
	fill={FILLED.has(name) ? 'currentColor' : 'none'}
	stroke={FILLED.has(name) ? 'none' : 'currentColor'}
	stroke-width="2"
	stroke-linecap="round"
	stroke-linejoin="round"
	aria-hidden="true"
>
	{#each PATHS[name] as d (d)}
		<path {d} />
	{/each}
</svg>

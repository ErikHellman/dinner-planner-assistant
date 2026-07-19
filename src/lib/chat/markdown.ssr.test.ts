import { expect, test } from 'vitest';

// Runs in the `server` (node, no DOM) project: Message.svelte imports this
// module during SSR, so importing it must not touch the DOM.
test('the module imports without a DOM, so SSR does not crash', async () => {
	await expect(import('./markdown')).resolves.toHaveProperty('renderMarkdown');
});

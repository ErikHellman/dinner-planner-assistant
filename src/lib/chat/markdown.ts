import DOMPurify from 'dompurify';
import { marked } from 'marked';

/**
 * Renders one assistant message as HTML.
 *
 * The agent's output is untrusted: it is model-generated and can quote text
 * fetched from Willys or a recipe site. So the markdown is parsed and then
 * sanitized — never inserted raw.
 *
 * Browser-only (DOMPurify needs a DOM). Called during streaming, once per
 * delta, so partially-written markdown must degrade to literal text rather
 * than throw; `marked` already does that.
 */
export function renderMarkdown(text: string): string {
	if (!text) return '';

	installLinkHook();

	// Synchronous by construction: no async extensions are registered.
	const html = marked.parse(text, { async: false, gfm: true, breaks: true });

	return DOMPurify.sanitize(html, {
		// Open links in a new tab, and deny the new page access to ours.
		ADD_ATTR: ['target', 'rel']
	});
}

let linkHookInstalled = false;

/**
 * Registered on first use rather than at module load: without a DOM,
 * `DOMPurify` is an uninitialised factory whose `addHook` does not exist, and
 * `Message.svelte` imports this module during SSR.
 */
function installLinkHook(): void {
	if (linkHookInstalled) return;
	linkHookInstalled = true;

	DOMPurify.addHook('afterSanitizeAttributes', (node) => {
		if (node.tagName === 'A' && node.hasAttribute('href')) {
			node.setAttribute('target', '_blank');
			node.setAttribute('rel', 'noopener noreferrer');
		}
	});
}

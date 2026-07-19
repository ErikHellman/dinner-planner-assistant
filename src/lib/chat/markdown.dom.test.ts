import { describe, expect, test } from 'vitest';
import { renderMarkdown } from './markdown';

describe('renderMarkdown', () => {
	test('renders the emphasis the agent actually emits', () => {
		expect(renderMarkdown('**Laxwok** med *jasminris*')).toBe(
			'<p><strong>Laxwok</strong> med <em>jasminris</em></p>\n'
		);
	});

	test('renders headings and lists', () => {
		expect(renderMarkdown('## Kort om rätten')).toContain('<h2>Kort om rätten</h2>');
		expect(renderMarkdown('- Laxfilé\n- Broccoli')).toContain('<li>Laxfilé</li>');
	});

	test('renders GFM tables, which the price answers rely on', () => {
		const html = renderMarkdown('| Vara | Pris |\n| --- | --- |\n| Smör | 49,90 kr |');
		expect(html).toContain('<table>');
		expect(html).toContain('<td>49,90 kr</td>');
	});

	test('renders inline and fenced code without executing it', () => {
		expect(renderMarkdown('`npm run dev`')).toContain('<code>npm run dev</code>');
	});

	test('strips script tags from model output', () => {
		expect(renderMarkdown('Hej <script>alert(1)</script>')).not.toContain('<script>');
	});

	test('strips event handlers from raw HTML in model output', () => {
		const html = renderMarkdown('<img src="x" onerror="alert(1)">');
		expect(html).not.toContain('onerror');
	});

	test('strips javascript: URLs from links', () => {
		const html = renderMarkdown('[klicka](javascript:alert(1))');
		expect(html).not.toContain('javascript:');
	});

	test('external links open in a new tab without leaking the opener', () => {
		const html = renderMarkdown('[Willys](https://www.willys.se)');
		expect(html).toContain('target="_blank"');
		expect(html).toContain('rel="noopener noreferrer"');
	});

	test('leaves an unterminated bold marker as literal text while streaming', () => {
		expect(renderMarkdown('Jag väljer **Laxwok')).toContain('**Laxwok');
	});

	test('empty input renders nothing', () => {
		expect(renderMarkdown('')).toBe('');
	});
});

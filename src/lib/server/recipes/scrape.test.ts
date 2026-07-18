import { describe, expect, it } from 'vitest';
import listingFixture from './fixtures/listing-page.json';
import recipeFixture from './fixtures/recipe-and-steps.json';
import { fakeFetch, listingHtml, nextDataHtml, recipeHtml } from './fixtures/helpers';
import {
	extractNextData,
	fetchImage,
	fetchListingPage,
	fetchRecipeDetail,
	listingFromNextData,
	listingUrl,
	recipeFromNextData,
	recipeUrl,
	RecipeScrapeError
} from './scrape';

describe('extractNextData', () => {
	it('extracts and parses the payload despite extra script attributes', () => {
		const data = extractNextData(nextDataHtml({ props: { pageProps: { page: 1 } } }));
		expect(data).toEqual({ props: { pageProps: { page: 1 } } });
	});

	it('extracts when id is not the first script attribute', () => {
		const html =
			'<script type="application/json" id="__NEXT_DATA__" nonce="">{"props":{"pageProps":{"page":2}}}</script>';
		expect(extractNextData(html)).toEqual({ props: { pageProps: { page: 2 } } });
	});

	it('throws RecipeScrapeError when the marker is missing', () => {
		expect(() => extractNextData('<html><body>nope</body></html>')).toThrow(RecipeScrapeError);
	});

	it('throws RecipeScrapeError on broken JSON', () => {
		expect(() =>
			extractNextData('<script id="__NEXT_DATA__" type="application/json">{oops</script>')
		).toThrow(RecipeScrapeError);
	});

	it('names the error and preserves the JSON parse cause', () => {
		let caught: unknown;
		try {
			extractNextData('<script id="__NEXT_DATA__" type="application/json">{oops</script>');
		} catch (err) {
			caught = err;
		}
		expect(caught).toBeInstanceOf(RecipeScrapeError);
		expect((caught as Error).name).toBe('RecipeScrapeError');
		expect((caught as Error).cause).toBeInstanceOf(SyntaxError);
	});
});

describe('payload navigation', () => {
	it('returns the listing pageProps', () => {
		const listing = listingFromNextData({ props: { pageProps: listingFixture } });
		expect(listing.totalPages).toBe(2);
		expect(listing.recipes).toHaveLength(2);
		expect(listing.recipes?.[0]?.recipeId).toBe(125524);
	});

	it('throws when a listing has no recipes array', () => {
		expect(() => listingFromNextData({ props: { pageProps: {} } })).toThrow(RecipeScrapeError);
	});

	it('finds recipeAndSteps regardless of the exact query key', () => {
		const data = extractNextData(recipeHtml(125524, recipeFixture));
		const recipe = recipeFromNextData(data);
		expect(recipe.recipeId).toBe(125524);
		expect(recipe.recipeName).toContain('Varmrökt lax');
	});

	it('throws when recipeAndSteps is absent', () => {
		expect(() =>
			recipeFromNextData({ props: { pageProps: { initialState: { api: { queries: {} } } } } })
		).toThrow(RecipeScrapeError);
	});
});

describe('URLs', () => {
	it('builds listing URLs (page 1 has no suffix)', () => {
		expect(listingUrl(1)).toBe('https://www.linasmatkasse.se/receptbank/kalorisnal');
		expect(listingUrl(3)).toBe('https://www.linasmatkasse.se/receptbank/kalorisnal/3');
	});

	it('builds recipe URLs with a default slug', () => {
		expect(recipeUrl(125524)).toBe('https://www.linasmatkasse.se/recept/125524/recept');
	});
});

describe('fetching', () => {
	it('fetches and parses a listing page', async () => {
		const fetchImpl = fakeFetch({
			'https://www.linasmatkasse.se/receptbank/kalorisnal': listingHtml(listingFixture)
		});
		const listing = await fetchListingPage(1, fetchImpl);
		expect(listing.recipes).toHaveLength(2);
	});

	it('fetches and parses a recipe detail page', async () => {
		const fetchImpl = fakeFetch({
			'https://www.linasmatkasse.se/recept/125524/recept': recipeHtml(125524, recipeFixture)
		});
		const recipe = await fetchRecipeDetail(125524, fetchImpl);
		expect(recipe.mainIngredient).toBe('Fisk');
	});

	it('throws RecipeScrapeError with the status on HTTP errors', async () => {
		await expect(fetchRecipeDetail(1, fakeFetch({}))).rejects.toThrow(/HTTP 404/);
	});

	it('throws RecipeScrapeError with the status when a listing page 404s', async () => {
		await expect(fetchListingPage(1, fakeFetch({}))).rejects.toThrow(/HTTP 404/);
	});

	it('fetches image bytes', async () => {
		const bytes = new Uint8Array([137, 80, 78, 71]);
		const fetchImpl = fakeFetch({ 'https://example.com/img.jpg': bytes });
		const result = await fetchImage('https://example.com/img.jpg', fetchImpl);
		expect(result).toBeInstanceOf(Uint8Array);
		expect(Array.from(result)).toEqual([137, 80, 78, 71]);
	});

	it('throws RecipeScrapeError with the status on image HTTP errors', async () => {
		await expect(fetchImage('https://example.com/missing.jpg', fakeFetch({}))).rejects.toThrow(
			/HTTP 404/
		);
	});
});

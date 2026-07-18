import type { RawListingPage, RawRecipeAndSteps } from './types';

export const BASE_URL = 'https://www.linasmatkasse.se';
const CATEGORY_PATH = '/receptbank/kalorisnal';
const USER_AGENT =
	'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

export class RecipeScrapeError extends Error {
	constructor(message: string, options?: ErrorOptions) {
		super(message, options);
		this.name = 'RecipeScrapeError';
	}
}

/** Pull the embedded Next.js JSON out of a page. The script tag carries extra attributes (nonce). */
export function extractNextData(html: string): unknown {
	const match = html.match(/<script[^>]*\bid="__NEXT_DATA__"[^>]*>(.*?)<\/script>/s);
	if (!match) throw new RecipeScrapeError('No __NEXT_DATA__ payload found in page');
	try {
		return JSON.parse(match[1]);
	} catch (err) {
		throw new RecipeScrapeError('Failed to parse __NEXT_DATA__ JSON', { cause: err });
	}
}

type NextData = { props?: { pageProps?: Record<string, unknown> } };

export function listingFromNextData(data: unknown): RawListingPage {
	const pageProps = (data as NextData)?.props?.pageProps;
	if (!pageProps || !Array.isArray((pageProps as { recipes?: unknown }).recipes)) {
		throw new RecipeScrapeError('Listing page has no recipes in its __NEXT_DATA__');
	}
	return pageProps as RawListingPage;
}

export function recipeFromNextData(data: unknown): RawRecipeAndSteps {
	const pageProps = (data as NextData)?.props?.pageProps as
		| {
				initialState?: {
					api?: { queries?: Record<string, { data?: { recipeAndSteps?: RawRecipeAndSteps } }> };
				};
		  }
		| undefined;
	const queries = pageProps?.initialState?.api?.queries ?? {};
	const key = Object.keys(queries).find((k) => k.startsWith('recipeAndSteps('));
	const recipe = key ? queries[key]?.data?.recipeAndSteps : undefined;
	if (!recipe)
		throw new RecipeScrapeError('Recipe page has no recipeAndSteps in its __NEXT_DATA__');
	return recipe;
}

export function listingUrl(page: number): string {
	return page <= 1 ? `${BASE_URL}${CATEGORY_PATH}` : `${BASE_URL}${CATEGORY_PATH}/${page}`;
}

export function recipeUrl(recipeId: number, slug = 'recept'): string {
	return `${BASE_URL}/recept/${recipeId}/${slug}`;
}

export async function fetchHtml(url: string, fetchImpl: typeof fetch = fetch): Promise<string> {
	const res = await fetchImpl(url, {
		headers: { 'user-agent': USER_AGENT, accept: 'text/html' },
		redirect: 'follow'
	});
	if (!res.ok) throw new RecipeScrapeError(`GET ${url} failed: HTTP ${res.status}`);
	return res.text();
}

export async function fetchListingPage(
	page: number,
	fetchImpl: typeof fetch = fetch
): Promise<RawListingPage> {
	return listingFromNextData(extractNextData(await fetchHtml(listingUrl(page), fetchImpl)));
}

export async function fetchRecipeDetail(
	recipeId: number,
	fetchImpl: typeof fetch = fetch
): Promise<RawRecipeAndSteps> {
	return recipeFromNextData(extractNextData(await fetchHtml(recipeUrl(recipeId), fetchImpl)));
}

export async function fetchImage(
	url: string,
	fetchImpl: typeof fetch = fetch
): Promise<Uint8Array> {
	const res = await fetchImpl(url, {
		headers: { 'user-agent': USER_AGENT },
		redirect: 'follow'
	});
	if (!res.ok) throw new RecipeScrapeError(`GET ${url} failed: HTTP ${res.status}`);
	return new Uint8Array(await res.arrayBuffer());
}

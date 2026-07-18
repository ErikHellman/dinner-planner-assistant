/** Wrap a payload the way Next.js embeds it (note the nonce attribute — the regex must tolerate it). */
export function nextDataHtml(data: unknown): string {
	return `<html><body><main>menu</main><script id="__NEXT_DATA__" type="application/json" nonce="">${JSON.stringify(
		data
	)}</script></body></html>`;
}

export function listingHtml(pageProps: unknown): string {
	return nextDataHtml({ props: { pageProps } });
}

export function recipeHtml(recipeId: number, recipeAndSteps: unknown): string {
	return nextDataHtml({
		props: {
			pageProps: {
				initialState: {
					api: {
						queries: {
							[`recipeAndSteps({"recipeId":${recipeId}})`]: { data: { recipeAndSteps } }
						}
					}
				}
			}
		}
	});
}

/** fetch stub with exact-URL routing; unknown URLs get a 404. */
export function fakeFetch(routes: Record<string, string | Uint8Array>): typeof fetch {
	return (async (input: RequestInfo | URL) => {
		const url = String(input);
		if (!(url in routes)) return new Response('not found', { status: 404 });
		return new Response(routes[url] as BodyInit, { status: 200 });
	}) as typeof fetch;
}

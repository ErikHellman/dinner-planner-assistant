import { readFile } from 'node:fs/promises';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { resolveRecipeImagePath } from '$lib/server/recipes/images';
import { defaultRecipesDir } from '$lib/server/recipes/query';

/** Recipe hero image bytes. Immutable caching is safe because generated URLs
 * carry a ?v= harvest-timestamp buster. */
export const GET: RequestHandler = async ({ params, url }) => {
	const filePath = resolveRecipeImagePath(
		defaultRecipesDir(),
		params.id,
		url.searchParams.get('size')
	);
	if (!filePath) {
		return json(
			{ error: 'Expected a numeric recipe id and size=large|small', code: 'bad_request' },
			{ status: 400 }
		);
	}
	try {
		const bytes = await readFile(filePath);
		return new Response(new Uint8Array(bytes), {
			headers: {
				'Content-Type': 'image/jpeg',
				'Content-Length': String(bytes.byteLength),
				'Cache-Control': 'public, max-age=31536000, immutable'
			}
		});
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
			return json({ error: 'Image not found', code: 'not_found' }, { status: 404 });
		}
		throw err;
	}
};

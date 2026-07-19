import { json } from '@sveltejs/kit';
import { ModelRuntime } from '@earendil-works/pi-coding-agent';
import type { RequestHandler } from './$types';
import type { ModelCatalog } from '$lib/settings/types';

// The catalog is static per server process; building a ModelRuntime is not free.
const g = globalThis as typeof globalThis & { __modelCatalog?: Promise<ModelCatalog> };

async function buildCatalog(): Promise<ModelCatalog> {
	const runtime = await ModelRuntime.create();
	const providers = runtime
		.getProviders()
		.map((provider) => ({
			id: provider.id,
			name: provider.name,
			models: runtime
				.getModels(provider.id)
				.map((model) => ({ id: model.id, name: model.name }))
				.sort((a, b) => a.name.localeCompare(b.name))
		}))
		.filter((provider) => provider.models.length > 0)
		.sort((a, b) => a.name.localeCompare(b.name));
	return { providers };
}

/** Provider/model options for the Inställningar dropdowns. An empty list is a
 * valid answer — the UI falls back to free-text inputs. */
export const GET: RequestHandler = async () => {
	g.__modelCatalog ??= buildCatalog().catch((err) => {
		g.__modelCatalog = undefined;
		throw err;
	});
	try {
		return json(await g.__modelCatalog);
	} catch (err) {
		console.warn('[settings] could not build the model catalog:', err);
		return json({ providers: [] } satisfies ModelCatalog);
	}
};

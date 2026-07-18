import { access, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { normalizeRecipe, RecipeNormalizeError } from './normalize';
import { fetchImage, fetchListingPage, fetchRecipeDetail, RecipeScrapeError } from './scrape';
import type { RawListingPage, RawRecipeAndSteps } from './types';

export interface HarvestOptions {
	/** Re-fetch recipes and images that already exist on disk. */
	force?: boolean;
	/** Cap the number of new recipes fetched (testing/politeness). */
	limit?: number;
	concurrency?: number;
	delayMs?: number;
	log?: (message: string) => void;
	fetchImpl?: typeof fetch;
}

export interface HarvestSummary {
	totalListed: number;
	harvested: number;
	skipped: number;
	failed: { recipeId: number; reason: string }[];
}

async function exists(file: string): Promise<boolean> {
	try {
		await access(file);
		return true;
	} catch {
		return false;
	}
}

function imageUrl(raw: RawRecipeAndSteps, size: 'small' | 'large'): string | null {
	return raw.images?.urls?.find((u) => u?.size === size)?.url || null;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Scrape the kalorisnål receptbank into `dir` (idempotent; failures don't abort the run). */
export async function harvest(dir: string, options: HarvestOptions = {}): Promise<HarvestSummary> {
	const {
		force = false,
		limit,
		concurrency = 4,
		delayMs = 150,
		log = () => {},
		fetchImpl = fetch
	} = options;
	const imagesDir = path.join(dir, 'images');
	await mkdir(imagesDir, { recursive: true });

	const listed: number[] = [];
	const collect = (page: RawListingPage) => {
		for (const r of page.recipes ?? []) {
			if (typeof r.recipeId === 'number' && !listed.includes(r.recipeId)) listed.push(r.recipeId);
		}
	};
	const first = await fetchListingPage(1, fetchImpl);
	collect(first);
	const totalPages = first.totalPages ?? 1;
	for (let page = 2; page <= totalPages; page++) {
		collect(await fetchListingPage(page, fetchImpl));
		log(`Listed page ${page}/${totalPages} (${listed.length} recipes so far)`);
	}

	const summary: HarvestSummary = {
		totalListed: listed.length,
		harvested: 0,
		skipped: 0,
		failed: []
	};
	const pending: number[] = [];
	for (const id of listed) {
		if (!force && (await exists(path.join(dir, `${id}.json`)))) summary.skipped++;
		else pending.push(id);
	}
	const queue = limit !== undefined ? pending.slice(0, limit) : pending;

	let index = 0;
	const worker = async () => {
		for (;;) {
			const i = index++;
			if (i >= queue.length) return;
			const recipeId = queue[i];
			try {
				await sleep(delayMs);
				const raw = await fetchRecipeDetail(recipeId, fetchImpl);
				const images: { large: string | null; small: string | null } = { large: null, small: null };
				for (const size of ['large', 'small'] as const) {
					const url = imageUrl(raw, size);
					if (!url) continue;
					try {
						const file = path.join(imagesDir, `${recipeId}-${size}.jpg`);
						if (force || !(await exists(file))) {
							await writeFile(file, await fetchImage(url, fetchImpl));
						}
						images[size] = `images/${recipeId}-${size}.jpg`;
					} catch (error) {
						log(
							`Image ${size} for ${recipeId} failed: ${error instanceof Error ? error.message : error}`
						);
					}
				}
				const doc = normalizeRecipe(raw, { images, harvestedAt: new Date().toISOString() });
				await writeFile(path.join(dir, `${recipeId}.json`), JSON.stringify(doc, null, 2) + '\n');
				summary.harvested++;
				log(`Harvested ${recipeId}: ${doc.name} (${summary.harvested}/${queue.length})`);
			} catch (error) {
				const reason =
					error instanceof RecipeScrapeError || error instanceof RecipeNormalizeError
						? error.message
						: `Unexpected error: ${error instanceof Error ? error.message : String(error)}`;
				summary.failed.push({ recipeId, reason });
				log(`Failed ${recipeId}: ${reason}`);
			}
		}
	};
	await Promise.all(
		Array.from({ length: Math.max(1, Math.min(concurrency, queue.length)) }, worker)
	);
	return summary;
}

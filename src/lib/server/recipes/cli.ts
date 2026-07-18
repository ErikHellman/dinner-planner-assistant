#!/usr/bin/env node
import { harvest } from './harvest';
import { defaultRecipesDir, RecipeStore, type RecipeSearchFilters } from './query';

function log(msg: string): void {
	process.stderr.write(msg + '\n');
}
function out(data: unknown): void {
	process.stdout.write(JSON.stringify(data, null, 2) + '\n');
}

function usage(): number {
	log(
		[
			'Usage:',
			'  recipes harvest [--force] [--limit N]',
			'  recipes search [--query q] [--category c] [--max-time minutes] [--max-kcal kcal]',
			'  recipes get <recipeId>',
			'  recipes ingredients <recipeId...>'
		].join('\n')
	);
	return 64;
}

/** --force -> true; --name value -> "value". Returns null on malformed or unknown flags. */
function parseFlags(
	args: string[],
	allowed: ReadonlySet<string>
): Map<string, string | true> | null {
	const flags = new Map<string, string | true>();
	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		if (!arg.startsWith('--')) return null;
		const name = arg.slice(2);
		if (!allowed.has(name)) return null;
		if (name === 'force') {
			flags.set(name, true);
			continue;
		}
		const value = args[++i];
		if (value === undefined) return null;
		flags.set(name, value);
	}
	return flags;
}

async function main(argv: string[]): Promise<number> {
	const [command, ...rest] = argv;
	const dir = defaultRecipesDir();
	const store = new RecipeStore(dir);

	try {
		if (command === 'harvest') {
			const flags = parseFlags(rest, new Set(['force', 'limit']));
			if (!flags) return usage();
			let limit: number | undefined;
			if (flags.has('limit')) {
				limit = Number(flags.get('limit'));
				if (!Number.isInteger(limit) || limit < 1) {
					log('--limit must be a positive integer');
					return 64;
				}
			}
			log('Harvesting kalorisnål recipes from linasmatkasse.se…');
			const summary = await harvest(dir, { force: flags.get('force') === true, limit, log });
			out(summary);
			return 0;
		}
		if (command === 'search') {
			const flags = parseFlags(rest, new Set(['query', 'category', 'max-time', 'max-kcal']));
			if (!flags) return usage();
			const filters: RecipeSearchFilters = {};
			if (flags.has('query')) filters.query = String(flags.get('query'));
			if (flags.has('category')) filters.category = String(flags.get('category'));
			for (const [flag, key] of [
				['max-time', 'maxTimeMinutes'],
				['max-kcal', 'maxKcal']
			] as const) {
				if (!flags.has(flag)) continue;
				const value = Number(flags.get(flag));
				if (!Number.isFinite(value) || value <= 0) {
					log(`--${flag} must be a positive number`);
					return 64;
				}
				filters[key] = value;
			}
			out(await store.search(filters));
			return 0;
		}
		if (command === 'get' && rest[0]) {
			const recipeId = Number(rest[0]);
			if (!Number.isInteger(recipeId)) {
				log('recipeId must be an integer');
				return 64;
			}
			out(await store.get(recipeId));
			return 0;
		}
		if (command === 'ingredients' && rest.length > 0) {
			const recipeIds = rest.map(Number);
			if (recipeIds.some((n) => !Number.isInteger(n))) {
				log('recipeIds must be integers');
				return 64;
			}
			out(await store.ingredients(recipeIds));
			return 0;
		}
		return usage();
	} catch (error) {
		log(`Error: ${error instanceof Error ? error.message : String(error)}`);
		return 1;
	}
}

main(process.argv.slice(2))
	.then((code) => process.exit(code))
	.catch((error) => {
		process.stderr.write(`Fatal: ${error instanceof Error ? error.message : String(error)}\n`);
		process.exit(1);
	});

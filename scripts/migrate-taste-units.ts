/**
 * One-off migration (2026-07): strip leftover units from "efter smak" ingredient lines.
 * The old normalizeIngredient kept ingredientAmountType even when the source amount was
 * absent/zero, producing { amount: null, unit: "krm", raw: "0 krm salt" }. The parser
 * now emits { amount: null, unit: null, raw: "salt" }; this rewrites existing docs to
 * match. Lines with real unparseable amounts ("½-1 klyfta vitlök") are left verbatim.
 *
 * Run: node --import tsx scripts/migrate-taste-units.ts
 */
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { writeFileAtomic } from '../src/lib/server/recipes/atomic-write';
import type { RecipeDoc } from '../src/lib/server/recipes/types';

const dir = path.resolve(import.meta.dirname, '../data/recipes');
const files = (await readdir(dir)).filter((f) => /^\d+\.json$/.test(f)).sort();
let changedLines = 0;
let changedFiles = 0;
for (const file of files) {
	const full = path.join(dir, file);
	const doc = JSON.parse(await readFile(full, 'utf8')) as RecipeDoc;
	let touched = false;
	for (const ing of doc.ingredients) {
		if (ing.amount !== null || ing.unit === null) continue;
		// Only lines whose raw proves the source amount was absent ("krm salt") or literal
		// zero ("0 krm salt") — exactly the inputs the parser now treats as per-taste.
		if (ing.raw !== `${ing.unit} ${ing.name}` && ing.raw !== `0 ${ing.unit} ${ing.name}`) continue;
		ing.unit = null;
		ing.raw = ing.name;
		touched = true;
		changedLines++;
	}
	if (!touched) continue;
	await writeFileAtomic(full, JSON.stringify(doc, null, 2) + '\n');
	changedFiles++;
}
console.log(`Updated ${changedLines} ingredient lines in ${changedFiles}/${files.length} docs.`);

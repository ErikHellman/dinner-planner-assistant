import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import type { Verdict, VerdictsDocument } from '../../verdicts/types';
import { writeFileAtomic } from '../recipes/atomic-write';

export class VerdictStoreError extends Error {}

export function defaultVerdictsFile(): string {
	return path.resolve(process.cwd(), 'data/verdicts.json');
}

const VERDICTS: Verdict[] = ['liked', 'vetoed'];

export function isVerdict(value: unknown): value is Verdict {
	return VERDICTS.includes(value as Verdict);
}

function emptyDocument(): VerdictsDocument {
	return { version: 1, verdicts: {} };
}

function isVerdictsShape(value: unknown): value is VerdictsDocument {
	if (typeof value !== 'object' || value === null) return false;
	const doc = value as Partial<VerdictsDocument>;
	return doc.version === 1 && typeof doc.verdicts === 'object' && doc.verdicts !== null;
}

/** Names by verdict, in insertion order, for the system prompt. */
export interface VerdictSummary {
	liked: string[];
	vetoed: string[];
}

/**
 * data/verdicts.json — the user's per-recipe judgements. A missing file is an
 * empty document, so nothing here is required for the app to start. A corrupt
 * one throws: silently starting over would lose judgements the user made
 * deliberately.
 */
export class VerdictStore {
	constructor(private readonly file: string = defaultVerdictsFile()) {}

	/** Serializes read-modify-write cycles. Two rapid clicks on different recipe
	 * cards issue overlapping PUTs, and interleaving them would silently drop
	 * whichever loaded first. */
	#writes: Promise<unknown> = Promise.resolve();

	async load(): Promise<VerdictsDocument> {
		let text: string;
		try {
			text = await readFile(this.file, 'utf8');
		} catch (err) {
			if ((err as NodeJS.ErrnoException).code === 'ENOENT') return emptyDocument();
			throw err;
		}
		let parsed: unknown;
		try {
			parsed = JSON.parse(text);
		} catch {
			throw new VerdictStoreError(`Verdict file ${this.file} is corrupt: not valid JSON.`);
		}
		if (!isVerdictsShape(parsed)) {
			throw new VerdictStoreError(
				`Verdict file ${this.file} is corrupt: not a version-1 verdicts document.`
			);
		}
		return parsed;
	}

	async set(recipeId: number, verdict: Verdict, name: string): Promise<VerdictsDocument> {
		return this.#update((doc) => {
			doc.verdicts[String(recipeId)] = { verdict, name, updatedAt: new Date().toISOString() };
		});
	}

	async clear(recipeId: number): Promise<VerdictsDocument> {
		return this.#update((doc) => {
			delete doc.verdicts[String(recipeId)];
		});
	}

	/** Names grouped by verdict, for buildSystemPrompt. */
	async summary(): Promise<VerdictSummary> {
		const { verdicts } = await this.load();
		const summary: VerdictSummary = { liked: [], vetoed: [] };
		for (const entry of Object.values(verdicts)) {
			summary[entry.verdict].push(entry.name);
		}
		return summary;
	}

	/** Queue a load-modify-save cycle behind any in-flight one. A failed write
	 * does not poison the queue for the next caller. */
	#update(mutate: (doc: VerdictsDocument) => void): Promise<VerdictsDocument> {
		const next = this.#writes
			.catch(() => {})
			.then(async () => {
				const doc = await this.load();
				mutate(doc);
				return this.save(doc);
			});
		this.#writes = next;
		return next;
	}

	private async save(doc: VerdictsDocument): Promise<VerdictsDocument> {
		await mkdir(path.dirname(this.file), { recursive: true });
		await writeFileAtomic(this.file, `${JSON.stringify(doc, null, 2)}\n`);
		return doc;
	}
}

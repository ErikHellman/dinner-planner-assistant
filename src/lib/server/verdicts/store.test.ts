import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { VerdictStore, VerdictStoreError } from './store';
import type { VerdictsDocument } from '../../verdicts/types';

describe('VerdictStore', () => {
	let dir: string;
	let file: string;
	let store: VerdictStore;

	beforeEach(async () => {
		dir = await mkdtemp(path.join(os.tmpdir(), 'verdicts-'));
		file = path.join(dir, 'verdicts.json');
		store = new VerdictStore(file);
	});

	afterEach(async () => {
		await rm(dir, { recursive: true, force: true });
	});

	it('loads an empty document when the file does not exist', async () => {
		await expect(store.load()).resolves.toEqual({ version: 1, verdicts: {} });
	});

	it('saves and reloads a verdict', async () => {
		await store.set(100575, 'liked', 'Grillad fläskkotlett');

		const loaded = await store.load();
		expect(loaded.verdicts['100575']).toMatchObject({
			verdict: 'liked',
			name: 'Grillad fläskkotlett'
		});
		expect(loaded.verdicts['100575'].updatedAt).toBeTypeOf('string');
	});

	it('overwrites an existing verdict for the same recipe', async () => {
		await store.set(100575, 'liked', 'Grillad fläskkotlett');
		await store.set(100575, 'vetoed', 'Grillad fläskkotlett');

		expect((await store.load()).verdicts['100575'].verdict).toBe('vetoed');
	});

	it('keeps other recipes untouched when one changes', async () => {
		await store.set(1, 'liked', 'Lax');
		await store.set(2, 'vetoed', 'Pasta');

		const loaded = await store.load();
		expect(Object.keys(loaded.verdicts).sort()).toEqual(['1', '2']);
	});

	it('does not lose a verdict when two are written concurrently', async () => {
		// Two rapid clicks on different recipe cards issue two overlapping PUTs.
		// A naive load-modify-save loses whichever finished first.
		await Promise.all([store.set(1, 'liked', 'Lax'), store.set(2, 'vetoed', 'Pasta')]);

		const loaded = await store.load();
		expect(Object.keys(loaded.verdicts).sort()).toEqual(['1', '2']);
	});

	it('clears a verdict', async () => {
		await store.set(1, 'liked', 'Lax');
		await store.clear(1);

		expect((await store.load()).verdicts).toEqual({});
	});

	it('clearing an unjudged recipe is a no-op, not an error', async () => {
		await expect(store.clear(999)).resolves.toBeDefined();
		expect((await store.load()).verdicts).toEqual({});
	});

	it('writes valid JSON that round-trips through the file', async () => {
		await store.set(1, 'liked', 'Lax');

		const parsed = JSON.parse(await readFile(file, 'utf8')) as VerdictsDocument;
		expect(parsed.version).toBe(1);
		expect(parsed.verdicts['1'].name).toBe('Lax');
	});

	it('rejects a corrupt document loudly rather than silently losing verdicts', async () => {
		await writeFile(file, '{ not json', 'utf8');

		await expect(store.load()).rejects.toThrow(VerdictStoreError);
	});

	it('rejects a document that is JSON but not a verdicts document', async () => {
		await writeFile(file, JSON.stringify({ version: 2, verdicts: {} }), 'utf8');

		await expect(store.load()).rejects.toThrow(VerdictStoreError);
	});

	it('summarizes names by verdict for the system prompt', async () => {
		await store.set(1, 'liked', 'Lax');
		await store.set(2, 'vetoed', 'Pasta');
		await store.set(3, 'liked', 'Kyckling');

		await expect(store.summary()).resolves.toEqual({
			liked: ['Lax', 'Kyckling'],
			vetoed: ['Pasta']
		});
	});

	it('summarizes to empty lists when nothing has been judged', async () => {
		await expect(store.summary()).resolves.toEqual({ liked: [], vetoed: [] });
	});
});

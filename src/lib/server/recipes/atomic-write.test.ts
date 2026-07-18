import { mkdir, mkdtemp, readdir, readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { writeFileAtomic } from './atomic-write';

describe('writeFileAtomic', () => {
	it('writes the content and leaves no .tmp file behind', async () => {
		const dir = await mkdtemp(path.join(os.tmpdir(), 'atomic-write-test-'));
		const file = path.join(dir, 'out.json');

		await writeFileAtomic(file, '{"ok":true}\n');

		expect(await readFile(file, 'utf8')).toBe('{"ok":true}\n');
		expect(await readdir(dir)).toEqual(['out.json']);
	});

	it('propagates errors from the tmp write itself', async () => {
		const dir = await mkdtemp(path.join(os.tmpdir(), 'atomic-write-test-'));
		// Writing to a path whose parent is a *file* fails.
		const blocker = path.join(dir, 'blocker');
		await writeFileAtomic(blocker, 'x');
		const file = path.join(blocker, 'nested.json');

		await expect(writeFileAtomic(file, 'x')).rejects.toThrow();
		expect(await readdir(dir)).toEqual(['blocker']);
	});

	it('cleans up the tmp file when the rename fails', async () => {
		const dir = await mkdtemp(path.join(os.tmpdir(), 'atomic-write-test-'));
		// rename(tmp, file) fails when the destination is a non-empty directory.
		const file = path.join(dir, 'target');
		await mkdir(path.join(file, 'occupied'), { recursive: true });

		await expect(writeFileAtomic(file, 'x')).rejects.toThrow();
		expect(await readdir(dir)).toEqual(['target']); // no target.tmp left behind
	});
});

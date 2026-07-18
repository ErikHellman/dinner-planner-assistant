import { randomUUID } from 'node:crypto';
import { rename, unlink, writeFile } from 'node:fs/promises';

/**
 * Write via tmp+rename so an interrupted run never leaves a truncated file (a partial
 * doc would poison the query layer's loadAll AND satisfy harvest's skip-if-exists
 * check). The tmp gets a per-call unique name so concurrent writers to the same target
 * never share it (last rename wins with complete content), lives in the same directory
 * (rename is POSIX-atomic only within a filesystem), and its `.tmp` suffix never
 * matches the query layer's /^\d+\.json$/ filter.
 */
export async function writeFileAtomic(file: string, data: Uint8Array | string): Promise<void> {
	const tmp = `${file}.${randomUUID()}.tmp`;
	try {
		await writeFile(tmp, data);
		await rename(tmp, file);
	} catch (error) {
		await unlink(tmp).catch(() => {});
		throw error;
	}
}

import crypto from 'node:crypto';
import { chmod, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { writeFileAtomic } from '../recipes/atomic-write';

export class SecretsError extends Error {}

const PREFIX = 'v1:';
const KEY_BYTES = 32; // aes-256
const IV_BYTES = 12; // GCM standard nonce
const TAG_BYTES = 16;

export function defaultKeyFile(): string {
	return path.resolve(process.cwd(), 'data/settings.key');
}

/**
 * The at-rest key, generated on first use. It lives next to data/settings.json,
 * so this protects against accidental leakage (backups, screenshots, a stray
 * commit) rather than against someone who already reads the data directory —
 * the deliberate trade-off for a single-user local app with no passphrase to
 * lose. Mode 0600 keeps other users on the machine out.
 */
export async function getOrCreateKey(file: string = defaultKeyFile()): Promise<Buffer> {
	try {
		const key = await readFile(file);
		if (key.length !== KEY_BYTES) {
			throw new SecretsError(
				`Key file ${file} is ${key.length} bytes, expected ${KEY_BYTES}. Delete it to generate a new one (stored secrets become unreadable).`
			);
		}
		return key;
	} catch (err) {
		if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
	}
	const key = crypto.randomBytes(KEY_BYTES);
	await mkdir(path.dirname(file), { recursive: true });
	await writeFileAtomic(file, key);
	// writeFileAtomic renames a fresh temp file into place, so the mode has to
	// be set afterwards rather than passed to writeFile.
	await chmod(file, 0o600);
	return key;
}

/** "v1:" + base64(iv | authTag | ciphertext). */
export function encryptSecret(plaintext: string, key: Buffer): string {
	const iv = crypto.randomBytes(IV_BYTES);
	const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
	const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
	return PREFIX + Buffer.concat([iv, cipher.getAuthTag(), ct]).toString('base64');
}

export function decryptSecret(blob: string, key: Buffer): string {
	if (!blob.startsWith(PREFIX)) {
		throw new SecretsError('Unrecognised secret format — expected a "v1:" blob.');
	}
	const raw = Buffer.from(blob.slice(PREFIX.length), 'base64');
	if (raw.length < IV_BYTES + TAG_BYTES) {
		throw new SecretsError('Encrypted secret is truncated.');
	}
	const iv = raw.subarray(0, IV_BYTES);
	const tag = raw.subarray(IV_BYTES, IV_BYTES + TAG_BYTES);
	const ct = raw.subarray(IV_BYTES + TAG_BYTES);
	const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
	decipher.setAuthTag(tag);
	try {
		return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
	} catch {
		// GCM auth failure: wrong key, or the file was edited by hand.
		throw new SecretsError(
			'Could not decrypt a stored secret — data/settings.key does not match data/settings.json. Re-enter the value in the Inställningar tab.'
		);
	}
}

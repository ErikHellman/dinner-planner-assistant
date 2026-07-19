import crypto from 'node:crypto';
import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { decryptSecret, encryptSecret, getOrCreateKey, SecretsError } from './secrets';

let dir: string;

beforeEach(async () => {
	dir = await mkdtemp(path.join(os.tmpdir(), 'settings-secrets-'));
});

afterEach(async () => {
	await rm(dir, { recursive: true, force: true });
});

describe('getOrCreateKey', () => {
	it('generates a 32-byte key file readable only by the owner', async () => {
		const file = path.join(dir, 'nested', 'settings.key');
		const key = await getOrCreateKey(file);
		expect(key).toHaveLength(32);
		expect((await stat(file)).mode & 0o777).toBe(0o600);
	});

	it('returns the same key on the next call', async () => {
		const file = path.join(dir, 'settings.key');
		expect(await getOrCreateKey(file)).toEqual(await getOrCreateKey(file));
	});

	it('rejects a key file of the wrong length', async () => {
		const file = path.join(dir, 'settings.key');
		await writeFile(file, Buffer.alloc(8));
		await expect(getOrCreateKey(file)).rejects.toThrow(SecretsError);
	});
});

describe('encryptSecret / decryptSecret', () => {
	const key = crypto.randomBytes(32);

	it('round-trips a value', () => {
		expect(decryptSecret(encryptSecret('sk-ant-hemlig', key), key)).toBe('sk-ant-hemlig');
	});

	it('never emits the plaintext', () => {
		expect(encryptSecret('sk-ant-hemlig', key)).not.toContain('hemlig');
	});

	it('produces a different blob every time (random iv)', () => {
		expect(encryptSecret('samma', key)).not.toBe(encryptSecret('samma', key));
	});

	it('fails with a different key', () => {
		const blob = encryptSecret('sk-ant-hemlig', key);
		expect(() => decryptSecret(blob, crypto.randomBytes(32))).toThrow(SecretsError);
	});

	it('fails on a tampered blob', () => {
		const blob = encryptSecret('sk-ant-hemlig', key);
		const raw = Buffer.from(blob.slice(3), 'base64');
		raw[raw.length - 1] ^= 0xff;
		expect(() => decryptSecret('v1:' + raw.toString('base64'), key)).toThrow(SecretsError);
	});

	it('rejects an unknown format', () => {
		expect(() => decryptSecret('plaintext', key)).toThrow(SecretsError);
	});
});

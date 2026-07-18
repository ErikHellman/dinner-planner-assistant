import crypto from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { encryptCredential, type EncryptedCredential } from './crypto';

/** Mirror of the Willys server-side decryption, for verification. */
function decrypt(field: EncryptedCredential): string {
	const decoded = Buffer.from(field.str, 'base64').toString('utf8');
	const [ivHex, saltHex, ctB64] = decoded.split('::');
	const key = crypto.pbkdf2Sync(Buffer.from(field.key, 'utf8'), Buffer.from(saltHex, 'hex'), 1000, 16, 'sha1');
	const d = crypto.createDecipheriv('aes-128-cbc', key, Buffer.from(ivHex, 'hex'));
	return Buffer.concat([d.update(Buffer.from(ctB64, 'base64')), d.final()]).toString('utf8');
}

describe('encryptCredential', () => {
	it('produces ciphertext the Willys scheme can decrypt back to the plaintext', () => {
		const field = encryptCredential('199001011234');
		expect(decrypt(field)).toBe('199001011234');
	});

	it('encodes str as base64(ivHex::saltHex::base64(ct)) with three parts', () => {
		const field = encryptCredential('hunter2');
		const decoded = Buffer.from(field.str, 'base64').toString('utf8');
		expect(decoded.split('::')).toHaveLength(3);
	});

	it('uses a fresh random passphrase/iv each call (different ciphertext)', () => {
		const a = encryptCredential('same');
		const b = encryptCredential('same');
		expect(a.str).not.toBe(b.str);
	});

	it('round-trips UTF-8 characters (åäö)', () => {
		const field = encryptCredential('lösenÖrd-åäö');
		expect(decrypt(field)).toBe('lösenÖrd-åäö');
	});
});

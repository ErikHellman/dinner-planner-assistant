import crypto from 'node:crypto';

export interface EncryptedCredential {
	/** base64( ivHex + "::" + saltHex + "::" + base64(ciphertext) ) */
	str: string;
	/** the passphrase (sent in cleartext as the *_key field) */
	key: string;
}

function randomPassphrase(): string {
	// 16 chars; content is arbitrary — the server uses it as the PBKDF2 password.
	return crypto.randomBytes(8).toString('hex');
}

/** Replicates the willys.se client-side credential encryption. */
export function encryptCredential(plaintext: string): EncryptedCredential {
	const passphrase = randomPassphrase();
	const salt = crypto.randomBytes(16);
	const iv = crypto.randomBytes(16);
	const key = crypto.pbkdf2Sync(Buffer.from(passphrase, 'utf8'), salt, 1000, 16, 'sha1');
	const cipher = crypto.createCipheriv('aes-128-cbc', key, iv);
	const ct = Buffer.concat([cipher.update(Buffer.from(plaintext, 'utf8')), cipher.final()]);
	const str = Buffer.from(
		`${iv.toString('hex')}::${salt.toString('hex')}::${ct.toString('base64')}`
	).toString('base64');
	return { str, key: passphrase };
}

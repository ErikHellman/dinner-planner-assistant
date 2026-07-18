export class WillysConfigError extends Error {
	constructor(
		message = 'Willys credentials missing: set WILLYS_USERNAME and WILLYS_PASSWORD in .env'
	) {
		super(message);
		this.name = 'WillysConfigError';
	}
}

export interface WillysConfig {
	username: string;
	password: string;
}

/** Validate Willys credentials from an env record (process.env or $env/dynamic/private). */
export function loadWillysConfig(env: Record<string, string | undefined>): WillysConfig {
	const username = env.WILLYS_USERNAME?.trim();
	const password = env.WILLYS_PASSWORD?.trim();
	if (!username || !password) {
		throw new WillysConfigError();
	}
	return { username, password };
}

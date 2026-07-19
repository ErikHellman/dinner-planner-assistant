export class WillysConfigError extends Error {
	constructor(
		message = 'Willys credentials missing: add them in the Inställningar tab (or set WILLYS_USERNAME and WILLYS_PASSWORD in .env)'
	) {
		super(message);
		this.name = 'WillysConfigError';
	}
}

export interface WillysConfig {
	username: string;
	password: string;
}

/** Non-throwing credential probe for health reporting. */
export function isWillysConfigured(env: Record<string, string | undefined>): boolean {
	return Boolean(env.WILLYS_USERNAME?.trim() && env.WILLYS_PASSWORD?.trim());
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

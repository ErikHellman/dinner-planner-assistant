import fs from 'node:fs';
import path from 'node:path';
import { encryptCredential } from './crypto';
import { loadWillysConfig, type WillysConfig } from './config';

const BASE = 'https://www.willys.se';
const USER_AGENT = 'dinner-planner-assistant (personal use)';

export class WillysAuthError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'WillysAuthError';
	}
}

interface PersistedSession {
	cookies: Record<string, string>;
}

/** Owns the authenticated HTTP session against willys.se. */
export class WillysSession {
	private jar = new Map<string, string>();
	private csrfToken: string | null = null;
	private authPromise: Promise<void> | null = null;

	constructor(
		private readonly env: Record<string, string | undefined>,
		private readonly sessionFile: string
	) {}

	private cookieHeader(): string {
		return [...this.jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
	}

	private absorb(res: Response): void {
		for (const c of res.headers.getSetCookie?.() ?? []) {
			const [kv] = c.split(';');
			const i = kv.indexOf('=');
			if (i > 0) this.jar.set(kv.slice(0, i).trim(), kv.slice(i + 1).trim());
		}
	}

	/** Low-level request with cookie jar. Does NOT ensure auth — callers do. */
	private async request(pathname: string, init: RequestInit = {}): Promise<Response> {
		const res = await fetch(BASE + pathname, {
			...init,
			headers: {
				'User-Agent': USER_AGENT,
				Accept: 'application/json',
				Cookie: this.cookieHeader(),
				...(init.headers ?? {})
			}
		});
		this.absorb(res);
		return res;
	}

	private loadPersisted(): void {
		try {
			const data = JSON.parse(fs.readFileSync(this.sessionFile, 'utf8')) as PersistedSession;
			for (const [k, v] of Object.entries(data.cookies ?? {})) this.jar.set(k, v);
		} catch {
			/* no persisted session */
		}
	}

	private persist(): void {
		fs.mkdirSync(path.dirname(this.sessionFile), { recursive: true, mode: 0o700 });
		const data: PersistedSession = { cookies: Object.fromEntries(this.jar) };
		fs.writeFileSync(this.sessionFile, JSON.stringify(data), { mode: 0o600 });
		fs.chmodSync(this.sessionFile, 0o600);
	}

	/** GET /customer → uid (or "anonymous"). A non-OK response is a real error. */
	async getUid(): Promise<string> {
		const res = await this.request('/axfood/rest/v1/customer');
		if (!res.ok) throw new WillysAuthError(`Willys customer check failed (${res.status})`);
		const body = (await res.json().catch(() => null)) as { uid?: string } | null;
		return body?.uid ?? 'anonymous';
	}

	private async login(config: WillysConfig): Promise<void> {
		this.jar.clear();
		// 1) homepage → csrf cookie
		await this.request('/');
		const hostCsrf = this.jar.get('__Host-csrf-token');
		if (!hostCsrf) throw new WillysAuthError('Could not obtain CSRF cookie from willys.se');
		// 2) POST /login with encrypted credentials
		const u = encryptCredential(config.username);
		const p = encryptCredential(config.password);
		const res = await this.request('/login', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', 'x-csrf-token': hostCsrf },
			body: JSON.stringify({
				j_username: u.str,
				j_username_key: u.key,
				j_password: p.str,
				j_password_key: p.key,
				j_remember_me: true
			})
		});
		const body = (await res.json().catch(() => null)) as { login_successful?: string } | null;
		if (!res.ok || body?.login_successful !== 'true') {
			throw new WillysAuthError(
				'Willys login failed — verify WILLYS_USERNAME and WILLYS_PASSWORD.'
			);
		}
		const uid = await this.getUid();
		if (uid === 'anonymous') {
			throw new WillysAuthError('Willys login did not produce an authenticated session.');
		}
		this.csrfToken = null;
		this.persist();
	}

	/**
	 * Guarantee an authenticated session. Reuses the persisted session when still
	 * valid; otherwise logs in. Throws WillysConfigError if credentials are absent.
	 * Concurrent callers share a single in-flight authentication.
	 */
	async ensureAuthenticated(): Promise<void> {
		if (this.authPromise) return this.authPromise;
		this.authPromise = this.doAuthenticate().finally(() => {
			this.authPromise = null;
		});
		return this.authPromise;
	}

	private async doAuthenticate(): Promise<void> {
		const config = loadWillysConfig(this.env); // throws WillysConfigError if missing
		if (this.jar.size === 0) this.loadPersisted();
		if (this.jar.size > 0) {
			try {
				if ((await this.getUid()) !== 'anonymous') return;
			} catch {
				/* transient error checking persisted session → fresh login */
			}
		}
		await this.login(config);
	}

	/** Fetch and cache the session-bound CSRF token (must be after login). */
	private async getCsrfToken(): Promise<string> {
		if (this.csrfToken) return this.csrfToken;
		const res = await this.request('/axfood/rest/v1/csrf-token');
		const text = (await res.text()).trim().replace(/["\s]/g, '');
		if (!text) throw new WillysAuthError('Could not obtain CSRF token');
		this.csrfToken = text;
		// The CSRF fetch rotates JSESSIONID; persist so the rotated cookies survive.
		this.persist();
		return text;
	}

	/** Authenticated mutating request (adds X-CSRF-Token; re-auths once on 401). */
	async mutate(pathname: string, init: RequestInit = {}): Promise<Response> {
		await this.ensureAuthenticated();
		const send = async () => {
			const token = await this.getCsrfToken();
			return this.request(pathname, {
				...init,
				headers: { 'X-CSRF-Token': token, ...(init.headers ?? {}) }
			});
		};
		let res = await send();
		if (res.status === 401) {
			this.csrfToken = null;
			this.jar.clear();
			await this.ensureAuthenticated();
			res = await send();
		}
		return res;
	}

	/** Authenticated read request. */
	async read(pathname: string): Promise<Response> {
		await this.ensureAuthenticated();
		return this.request(pathname);
	}
}

# Willys Grocery Tool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the dinner-planner Pi agent a deterministic, login-gated tool to search Willys groceries and manage the user's online shopping cart, with LLM-friendly structured output.

**Architecture:** One shared TypeScript client library under `src/lib/server/willys/` (pure-HTTP against the Axfood/Hybris backend — no browser). It is exposed two ways: as native Pi tools registered on the agent session, and as a thin standalone CLI. Every operation is gated behind an authenticated session; anonymous use is impossible through the tool. Checkout is out of scope.

**Tech Stack:** TypeScript, Node 24.9.0 (`crypto`, global `fetch`), SvelteKit server modules, Pi SDK (`@earendil-works/pi-coding-agent`), `typebox` for tool parameter schemas, Vitest, `tsx` for CLI execution.

**Reference spec:** [docs/superpowers/specs/2026-07-18-willys-grocery-tool-design.md](../specs/2026-07-18-willys-grocery-tool-design.md) — contains the verified API contract this plan implements.

---

## Verified API contract (from the spec — implement exactly this)

- Base: `https://www.willys.se`. Plain HTTP + cookie jar.
- **Login:** `GET /` → `__Host-csrf-token` cookie; encrypt username & password (see crypto below); `POST /login` (JSON) `{ j_username, j_username_key, j_password, j_password_key, j_remember_me }` with header `x-csrf-token: <__Host-csrf-token>` → `200 {"login_successful":"true"}` + session cookies.
- **Credential encryption:** passphrase = 16 random chars; `key = PBKDF2(passphrase, salt(16B), 1000, SHA-1, 16B)`; `ct = AES-128-CBC(plaintext, iv(16B))`; `str = base64(ivHex + "::" + saltHex + "::" + base64(ct))`. Sent as `{ str, key: passphrase }`.
- **Login gate:** `GET /axfood/rest/v1/customer` → `uid` is `"anonymous"` (logged out) or the real uid (logged in).
- **CSRF (mutations only):** `GET /axfood/rest/v1/csrf-token` → UUID string; send as header `X-CSRF-Token` on every POST/DELETE. Fetch it AFTER login (it rotates `JSESSIONID` but keeps auth).
- **Search:** `GET /axfood/rest/v1/search?q={q}&page={0}&size={<=30}`.
- **Product detail (categories):** `GET /axfood/rest/v1/p/{code}` → `breadcrumbs[]` (`{name, categoryCode}`).
- **Cart:** `GET /axfood/rest/v1/cart`; `POST /axfood/rest/v1/cart/addProduct?productCodePost={code}&qty={n}&pickUnit={pieces|kilogram}` (qty absolute, `0` removes); `DELETE /axfood/rest/v1/cart` (clear). `pickUnit` maps `ST→pieces`, `KG→kilogram`.

## File structure

| File | Responsibility |
|---|---|
| `src/lib/server/willys/config.ts` | Read + validate `WILLYS_USERNAME`/`WILLYS_PASSWORD` from an env record |
| `src/lib/server/willys/crypto.ts` | Replicate the client-side credential encryption (pure) |
| `src/lib/server/willys/types.ts` | Shared types (normalized output + raw shapes) |
| `src/lib/server/willys/normalize.ts` | Raw Axfood JSON → normalized product & cart (pure) |
| `src/lib/server/willys/session.ts` | Login, cookie jar, CSRF, persistence, auto-relogin, login gate |
| `src/lib/server/willys/client.ts` | Typed ops: search / product / getCart / addToCart / setQuantity / removeFromCart / clearCart |
| `src/lib/server/willys/cli.ts` | Thin standalone CLI (data→stdout, status→stderr) |
| `src/lib/server/agent/tools/willys.ts` | Native Pi `ToolDefinition`s wrapping the client |
| `src/lib/server/agent/session.ts` | (modify) register Willys tools; `noTools:'builtin'` |

Test files live beside their module (`*.test.ts`). Live-integration tests are gated behind `WILLYS_LIVE=1` + credentials and are excluded from the default `npm test`.

---

## Task 0: Dependencies, ignore rules, env template

**Files:**
- Modify: `package.json`
- Modify: `.gitignore`
- Modify: `.env.example`

- [ ] **Step 1: Add runtime + dev dependencies**

Run (Node 24.9.0):
```bash
PATH="$HOME/.nvm/versions/node/v24.9.0/bin:$PATH" npm install typebox@1.1.38
PATH="$HOME/.nvm/versions/node/v24.9.0/bin:$PATH" npm install -D tsx@^4.19.2
```
Rationale: `typebox` is only nested under the Pi package; we import `Type` directly, so it must be a top-level dependency. Pinned to `1.1.38` to match Pi. `tsx` runs the TS CLI with extensionless imports.

- [ ] **Step 2: Add npm scripts**

In `package.json` `"scripts"`, add:
```json
"willys": "node --env-file=.env --import tsx src/lib/server/willys/cli.ts",
"test:willys": "WILLYS_LIVE=1 node --env-file=.env node_modules/vitest/vitest.mjs run src/lib/server/willys"
```

- [ ] **Step 3: Ignore the session cache directory**

Append to `.gitignore` under the existing `# Agent session logs` area:
```
# Willys session cache (contains auth cookies)
/data/willys/
```

- [ ] **Step 4: Document the env vars**

Append to `.env.example`:
```
# Willys online grocery. WILLYS_USERNAME is the Swedish personnummer (YYYYMMDDNNNN)
# or Willys Plus number used at willys.se (password login, not BankID).
WILLYS_USERNAME=
WILLYS_PASSWORD=
```

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json .gitignore .env.example
git commit -m "chore: add willys tool deps, ignore rules, env template"
```

---

## Task 1: Credential config loader

**Files:**
- Create: `src/lib/server/willys/config.ts`
- Test: `src/lib/server/willys/config.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { loadWillysConfig, WillysConfigError } from './config';

describe('loadWillysConfig', () => {
	it('returns trimmed credentials when both are present', () => {
		const cfg = loadWillysConfig({ WILLYS_USERNAME: ' 199001011234 ', WILLYS_PASSWORD: 'secret ' });
		expect(cfg).toEqual({ username: '199001011234', password: 'secret' });
	});

	it('throws WillysConfigError when username is missing', () => {
		expect(() => loadWillysConfig({ WILLYS_PASSWORD: 'x' })).toThrow(WillysConfigError);
	});

	it('throws WillysConfigError when password is empty', () => {
		expect(() => loadWillysConfig({ WILLYS_USERNAME: 'x', WILLYS_PASSWORD: '  ' })).toThrow(
			WillysConfigError
		);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `PATH="$HOME/.nvm/versions/node/v24.9.0/bin:$PATH" npm test -- src/lib/server/willys/config.test.ts`
Expected: FAIL — cannot find module `./config`.

- [ ] **Step 3: Write minimal implementation**

```ts
export class WillysConfigError extends Error {
	constructor(message = 'Willys credentials missing: set WILLYS_USERNAME and WILLYS_PASSWORD in .env') {
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `PATH="$HOME/.nvm/versions/node/v24.9.0/bin:$PATH" npm test -- src/lib/server/willys/config.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/willys/config.ts src/lib/server/willys/config.test.ts
git commit -m "feat: willys credential config loader"
```

---

## Task 2: Credential encryption

**Files:**
- Create: `src/lib/server/willys/crypto.ts`
- Test: `src/lib/server/willys/crypto.test.ts`

The test decrypts using the same scheme the Willys server uses, proving the ciphertext is valid (round-trip), rather than asserting a magic string.

- [ ] **Step 1: Write the failing test**

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `PATH="$HOME/.nvm/versions/node/v24.9.0/bin:$PATH" npm test -- src/lib/server/willys/crypto.test.ts`
Expected: FAIL — cannot find module `./crypto`.

- [ ] **Step 3: Write minimal implementation**

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `PATH="$HOME/.nvm/versions/node/v24.9.0/bin:$PATH" npm test -- src/lib/server/willys/crypto.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/willys/crypto.ts src/lib/server/willys/crypto.test.ts
git commit -m "feat: replicate willys credential encryption"
```

---

## Task 3: Shared types

**Files:**
- Create: `src/lib/server/willys/types.ts`

No test (type declarations only).

- [ ] **Step 1: Create the types**

```ts
/** A price with numeric + formatted forms. */
export interface Money {
	amount: number | null;
	formatted: string;
	currency?: 'SEK';
}

/** Price per unit, e.g. 10.60 kr per "l". */
export interface UnitPrice {
	amount: number | null;
	unit: string | null;
	formatted: string;
}

/** Normalized product for LLM consumption. */
export interface NormalizedProduct {
	productId: string;
	name: string;
	brand: string | null;
	displaySize: string | null;
	pickUnit: 'pieces' | 'kilogram';
	price: Money;
	unitPrice: UnitPrice;
	categories: string[];
	categoryCode: string | null;
	labels: string[];
	inStock: boolean;
	addable: boolean;
	imageUrl: string | null;
}

/** One line in the normalized cart. */
export interface NormalizedCartLine {
	productId: string;
	name: string;
	brand: string | null;
	quantity: number;
	pickUnit: string;
	unitPrice: Money;
	lineTotal: Money;
	categories: string[];
	displaySize: string | null;
}

/** Normalized cart for LLM verification. */
export interface NormalizedCart {
	store: { id: string | null };
	itemCount: number;
	totalQuantity: number;
	lines: NormalizedCartLine[];
	subtotal: Money;
	deposit: Money;
	discountTotal: Money;
}

/** Raw Axfood product (only the fields we read). */
export interface RawProduct {
	code: string;
	name: string;
	manufacturer?: string | null;
	productLine2?: string | null;
	price?: string | null;
	priceValue?: number | null;
	priceUnit?: string | null;
	comparePrice?: string | null;
	comparePriceUnit?: string | null;
	displayVolume?: string | null;
	productBasketType?: { code?: string } | null;
	labels?: string[] | null;
	online?: boolean | null;
	outOfStock?: boolean | null;
	addToCartDisabled?: boolean | null;
	categoryName?: string | null;
	categoryCode?: string | null;
	quantity?: number | null;
	totalPrice?: string | null;
	image?: { url?: string } | null;
	thumbnail?: { url?: string } | null;
}

export interface RawBreadcrumb {
	name: string;
	categoryCode?: string | null;
}
```

- [ ] **Step 2: Verify it type-checks**

Run: `PATH="$HOME/.nvm/versions/node/v24.9.0/bin:$PATH" npm run check`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/server/willys/types.ts
git commit -m "feat: willys shared types"
```

---

## Task 4: Normalizers (pure)

**Files:**
- Create: `src/lib/server/willys/normalize.ts`
- Test: `src/lib/server/willys/normalize.test.ts`

- [ ] **Step 1: Write the failing test**

Fixtures are trimmed copies of real responses captured during reverse-engineering.

```ts
import { describe, expect, it } from 'vitest';
import { parseAmount, normalizeProduct, normalizeCart } from './normalize';
import type { RawProduct } from './types';

const rawMilk: RawProduct = {
	code: '101233933_ST',
	name: 'Mellanmjölk Längre Hållbarhet 1,5%',
	manufacturer: 'Garant',
	productLine2: 'GARANT, 1,5l',
	price: '15,90 kr',
	priceValue: 15.9,
	priceUnit: 'kr/st',
	comparePrice: '10,60 kr',
	comparePriceUnit: 'l',
	displayVolume: '1,5l',
	productBasketType: { code: 'ST' },
	labels: ['swedish_flag', 'from_sweden'],
	online: true,
	outOfStock: false,
	addToCartDisabled: false,
	image: { url: 'https://assets.axfood.se/img/milk' }
};

describe('parseAmount', () => {
	it('parses Swedish currency strings', () => {
		expect(parseAmount('15,90 kr')).toBe(15.9);
		expect(parseAmount('10,60 kr')).toBe(10.6);
	});
	it('returns null for empty/undefined', () => {
		expect(parseAmount('')).toBeNull();
		expect(parseAmount(undefined)).toBeNull();
	});
});

describe('normalizeProduct', () => {
	it('maps a raw product with enriched categories', () => {
		const p = normalizeProduct(rawMilk, ['Mejeri, ost & ägg', 'Mjölk', 'Mellanmjölk']);
		expect(p).toMatchObject({
			productId: '101233933_ST',
			name: 'Mellanmjölk Längre Hållbarhet 1,5%',
			brand: 'Garant',
			displaySize: '1,5l',
			pickUnit: 'pieces',
			price: { amount: 15.9, formatted: '15,90 kr', currency: 'SEK' },
			unitPrice: { amount: 10.6, unit: 'l', formatted: '10,60 kr/l' },
			categories: ['Mejeri, ost & ägg', 'Mjölk', 'Mellanmjölk'],
			labels: ['swedish_flag', 'from_sweden'],
			inStock: true,
			addable: true,
			imageUrl: 'https://assets.axfood.se/img/milk'
		});
	});

	it('maps KG basket type to kilogram and marks out-of-stock non-addable', () => {
		const p = normalizeProduct(
			{ ...rawMilk, productBasketType: { code: 'KG' }, outOfStock: true, addToCartDisabled: true },
			[]
		);
		expect(p.pickUnit).toBe('kilogram');
		expect(p.inStock).toBe(false);
		expect(p.addable).toBe(false);
	});
});

describe('normalizeCart', () => {
	it('normalizes cart lines and totals', () => {
		const rawCart = {
			totalItems: 1,
			subTotalPrice: '31,80 kr',
			totalDepositSum: '',
			totalDiscountValue: 0,
			store: { id: '2583' },
			products: [
				{
					code: '101233933_ST',
					name: 'Mellanmjölk Längre Hållbarhet 1,5%',
					manufacturer: 'Garant',
					productLine2: 'GARANT, 1,5l',
					displayVolume: '1,5l',
					quantity: 2,
					price: '15,90 kr',
					totalPrice: '31,80 kr',
					pickUnit: { code: 'pieces', name: 'st' },
					categoryName: 'Mejeri, ost & ägg'
				}
			]
		};
		const cart = normalizeCart(rawCart as never, '2583');
		expect(cart.itemCount).toBe(1);
		expect(cart.totalQuantity).toBe(2);
		expect(cart.subtotal).toEqual({ amount: 31.8, formatted: '31,80 kr', currency: 'SEK' });
		expect(cart.lines[0]).toMatchObject({
			productId: '101233933_ST',
			quantity: 2,
			pickUnit: 'pieces',
			unitPrice: { amount: 15.9, formatted: '15,90 kr' },
			lineTotal: { amount: 31.8, formatted: '31,80 kr' }
		});
	});

	it('normalizes an empty cart', () => {
		const cart = normalizeCart({ totalItems: 0, subTotalPrice: '', products: [] } as never, null);
		expect(cart.itemCount).toBe(0);
		expect(cart.lines).toEqual([]);
	});
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `PATH="$HOME/.nvm/versions/node/v24.9.0/bin:$PATH" npm test -- src/lib/server/willys/normalize.test.ts`
Expected: FAIL — cannot find module `./normalize`.

- [ ] **Step 3: Write minimal implementation**

```ts
import type {
	Money,
	NormalizedCart,
	NormalizedCartLine,
	NormalizedProduct,
	RawProduct,
	UnitPrice
} from './types';

/** Parse a Swedish currency string like "15,90 kr" → 15.9. */
export function parseAmount(formatted?: string | null): number | null {
	if (!formatted) return null;
	const cleaned = formatted.replace(/\s|kr/g, '').replace(',', '.');
	const n = Number.parseFloat(cleaned);
	return Number.isFinite(n) ? n : null;
}

function money(formatted?: string | null): Money {
	return { amount: parseAmount(formatted), formatted: formatted?.trim() || '', currency: 'SEK' };
}

function pickUnitOf(raw: RawProduct): 'pieces' | 'kilogram' {
	return raw.productBasketType?.code === 'KG' ? 'kilogram' : 'pieces';
}

export function normalizeProduct(raw: RawProduct, categories: string[]): NormalizedProduct {
	const unit: UnitPrice = {
		amount: parseAmount(raw.comparePrice),
		unit: raw.comparePriceUnit ?? null,
		formatted:
			raw.comparePrice && raw.comparePriceUnit
				? `${raw.comparePrice.trim()}/${raw.comparePriceUnit}`
				: raw.comparePrice?.trim() || ''
	};
	return {
		productId: raw.code,
		name: raw.name,
		brand: raw.manufacturer ?? null,
		displaySize: raw.displayVolume ?? raw.productLine2 ?? null,
		pickUnit: pickUnitOf(raw),
		price: money(raw.price),
		unitPrice: unit,
		categories,
		categoryCode: raw.categoryCode ?? null,
		labels: raw.labels ?? [],
		inStock: raw.online === true && raw.outOfStock !== true,
		addable: raw.addToCartDisabled !== true && raw.outOfStock !== true,
		imageUrl: raw.image?.url ?? raw.thumbnail?.url ?? null
	};
}

interface RawCart {
	totalItems?: number;
	subTotalPrice?: string;
	totalDepositSum?: string;
	totalDiscountValue?: number;
	products?: RawProduct[];
}

export function normalizeCart(raw: RawCart, storeId: string | null): NormalizedCart {
	const products = raw.products ?? [];
	const lines: NormalizedCartLine[] = products.map((p) => ({
		productId: p.code,
		name: p.name,
		brand: p.manufacturer ?? null,
		quantity: p.quantity ?? 0,
		pickUnit:
			(p as { pickUnit?: { code?: string } }).pickUnit?.code ?? pickUnitOf(p),
		unitPrice: money(p.price),
		lineTotal: money(p.totalPrice),
		categories: p.categoryName ? [p.categoryName] : [],
		displaySize: p.displayVolume ?? p.productLine2 ?? null
	}));
	return {
		store: { id: storeId },
		itemCount: lines.length,
		totalQuantity: lines.reduce((sum, l) => sum + l.quantity, 0),
		lines,
		subtotal: money(raw.subTotalPrice),
		deposit: money(raw.totalDepositSum),
		discountTotal: {
			amount: raw.totalDiscountValue ?? 0,
			formatted: raw.totalDiscountValue ? `${raw.totalDiscountValue} kr` : '0,00 kr',
			currency: 'SEK'
		}
	};
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `PATH="$HOME/.nvm/versions/node/v24.9.0/bin:$PATH" npm test -- src/lib/server/willys/normalize.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/willys/normalize.ts src/lib/server/willys/normalize.test.ts
git commit -m "feat: willys response normalizers"
```

---

## Task 5: Session (login, cookies, CSRF, gate, persistence)

**Files:**
- Create: `src/lib/server/willys/session.ts`
- Test: `src/lib/server/willys/session.test.ts` (live, gated)

- [ ] **Step 1: Write the implementation**

```ts
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
	async request(pathname: string, init: RequestInit = {}): Promise<Response> {
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
		fs.mkdirSync(path.dirname(this.sessionFile), { recursive: true });
		const data: PersistedSession = { cookies: Object.fromEntries(this.jar) };
		fs.writeFileSync(this.sessionFile, JSON.stringify(data), { mode: 0o600 });
		fs.chmodSync(this.sessionFile, 0o600);
	}

	/** GET /customer → uid (or "anonymous"). */
	async getUid(): Promise<string> {
		const res = await this.request('/axfood/rest/v1/customer');
		if (!res.ok) return 'anonymous';
		const body = (await res.json()) as { uid?: string };
		return body.uid ?? 'anonymous';
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
			throw new WillysAuthError('Willys login failed — verify WILLYS_USERNAME and WILLYS_PASSWORD.');
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
	 */
	async ensureAuthenticated(): Promise<void> {
		const config = loadWillysConfig(this.env); // throws WillysConfigError if missing
		if (this.jar.size === 0) this.loadPersisted();
		if (this.jar.size > 0 && (await this.getUid()) !== 'anonymous') return;
		await this.login(config);
	}

	/** Fetch and cache the session-bound CSRF token (must be after login). */
	private async getCsrfToken(): Promise<string> {
		if (this.csrfToken) return this.csrfToken;
		const res = await this.request('/axfood/rest/v1/csrf-token');
		const text = (await res.text()).replace(/["\s]/g, '');
		if (!text) throw new WillysAuthError('Could not obtain CSRF token');
		this.csrfToken = text;
		return text;
	}

	/** Authenticated mutating request (adds X-CSRF-Token; re-auths once on 401). */
	async mutate(pathname: string, init: RequestInit = {}): Promise<Response> {
		await this.ensureAuthenticated();
		const send = async () => {
			const token = await this.getCsrfToken();
			return this.request(pathname, { ...init, headers: { 'X-CSRF-Token': token, ...(init.headers ?? {}) } });
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
```

- [ ] **Step 2: Write the live login test**

```ts
import { describe, expect, it, beforeAll } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import { WillysSession } from './session';

const LIVE = process.env.WILLYS_LIVE === '1' && !!process.env.WILLYS_USERNAME && !!process.env.WILLYS_PASSWORD;
const d = LIVE ? describe : describe.skip;

d('WillysSession (live)', () => {
	let session: WillysSession;
	beforeAll(() => {
		const file = path.join(os.tmpdir(), `willys-test-session-${process.pid}.json`);
		session = new WillysSession(process.env, file);
	});

	it('logs in and reaches a non-anonymous session', async () => {
		await session.ensureAuthenticated();
		const uid = await session.getUid();
		expect(uid).not.toBe('anonymous');
	}, 30000);

	it('reads the cart (authenticated)', async () => {
		const res = await session.read('/axfood/rest/v1/cart');
		expect(res.status).toBe(200);
		const cart = (await res.json()) as { products?: unknown[] };
		expect(Array.isArray(cart.products)).toBe(true);
	}, 30000);
});
```

- [ ] **Step 3: Run the live test**

Run: `PATH="$HOME/.nvm/versions/node/v24.9.0/bin:$PATH" npm run test:willys -- src/lib/server/willys/session.test.ts`
Expected: PASS (2 tests). Without creds it skips.

- [ ] **Step 4: Confirm the default test run stays green (live tests skip)**

Run: `PATH="$HOME/.nvm/versions/node/v24.9.0/bin:$PATH" npm test -- src/lib/server/willys`
Expected: PASS; the live `describe` is skipped.

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/willys/session.ts src/lib/server/willys/session.test.ts
git commit -m "feat: willys authenticated session with CSRF + login gate"
```

---

## Task 6: Client (search, product, cart ops)

**Files:**
- Create: `src/lib/server/willys/client.ts`
- Test: `src/lib/server/willys/client.test.ts` (live, gated)

- [ ] **Step 1: Write the implementation**

```ts
import { WillysSession } from './session';
import { normalizeCart, normalizeProduct } from './normalize';
import type { NormalizedCart, NormalizedProduct, RawBreadcrumb, RawProduct } from './types';

const MAX_SIZE = 30;
const ENRICH_CONCURRENCY = 4;

/** High-level, login-gated Willys operations returning normalized output. */
export class WillysClient {
	private categoryCache = new Map<string, string[]>();

	constructor(private readonly session: WillysSession) {}

	private async categoriesFor(code: string): Promise<string[]> {
		const cached = this.categoryCache.get(code);
		if (cached) return cached;
		const res = await this.session.read(`/axfood/rest/v1/p/${encodeURIComponent(code)}`);
		let categories: string[] = [];
		if (res.ok) {
			const body = (await res.json()) as { breadcrumbs?: RawBreadcrumb[] };
			categories = (body.breadcrumbs ?? [])
				.filter((b) => b.categoryCode && b.categoryCode !== 'N00')
				.map((b) => b.name);
		}
		this.categoryCache.set(code, categories);
		return categories;
	}

	/** Search products, enriching each hit with its category breadcrumb. */
	async search(query: string, page = 0, size = MAX_SIZE): Promise<NormalizedProduct[]> {
		const capped = Math.min(Math.max(1, size), MAX_SIZE);
		const res = await this.session.read(
			`/axfood/rest/v1/search?q=${encodeURIComponent(query)}&page=${page}&size=${capped}`
		);
		if (!res.ok) throw new Error(`Willys search failed (${res.status})`);
		const body = (await res.json()) as { results?: RawProduct[] };
		const raw = body.results ?? [];
		return this.enrich(raw);
	}

	private async enrich(raw: RawProduct[]): Promise<NormalizedProduct[]> {
		const out: NormalizedProduct[] = new Array(raw.length);
		let next = 0;
		const worker = async () => {
			while (next < raw.length) {
				const i = next++;
				out[i] = normalizeProduct(raw[i], await this.categoriesFor(raw[i].code));
			}
		};
		await Promise.all(Array.from({ length: Math.min(ENRICH_CONCURRENCY, raw.length) }, worker));
		return out;
	}

	/** Single product detail (normalized, category-enriched). */
	async product(productId: string): Promise<NormalizedProduct> {
		const res = await this.session.read(`/axfood/rest/v1/p/${encodeURIComponent(productId)}`);
		if (!res.ok) throw new Error(`Willys product lookup failed (${res.status})`);
		const raw = (await res.json()) as RawProduct & { breadcrumbs?: RawBreadcrumb[] };
		const categories = (raw.breadcrumbs ?? [])
			.filter((b) => b.categoryCode && b.categoryCode !== 'N00')
			.map((b) => b.name);
		this.categoryCache.set(productId, categories);
		return normalizeProduct(raw, categories);
	}

	async getCart(): Promise<NormalizedCart> {
		const res = await this.session.read('/axfood/rest/v1/cart');
		if (!res.ok) throw new Error(`Willys cart read failed (${res.status})`);
		const raw = (await res.json()) as Parameters<typeof normalizeCart>[0];
		const storeId = await this.activeStoreId();
		return normalizeCart(raw, storeId);
	}

	private async activeStoreId(): Promise<string | null> {
		const res = await this.session.read('/axfood/rest/v1/store/active');
		if (!res.ok) return null;
		const body = (await res.json()) as { id?: string };
		return body.id ?? null;
	}

	/** Add or set the absolute quantity of a product. pickUnit defaults to "pieces". */
	async setQuantity(
		productId: string,
		quantity: number,
		pickUnit: 'pieces' | 'kilogram' = 'pieces'
	): Promise<NormalizedCart> {
		const qs = `productCodePost=${encodeURIComponent(productId)}&qty=${quantity}&pickUnit=${pickUnit}`;
		const res = await this.session.mutate(`/axfood/rest/v1/cart/addProduct?${qs}`, { method: 'POST' });
		if (!res.ok) {
			const text = await res.text();
			throw new Error(`Willys cart update failed (${res.status}): ${text.slice(0, 200)}`);
		}
		return this.getCart();
	}

	addToCart(productId: string, quantity = 1, pickUnit: 'pieces' | 'kilogram' = 'pieces') {
		return this.setQuantity(productId, quantity, pickUnit);
	}

	removeFromCart(productId: string, pickUnit: 'pieces' | 'kilogram' = 'pieces') {
		return this.setQuantity(productId, 0, pickUnit);
	}

	async clearCart(): Promise<NormalizedCart> {
		const res = await this.session.mutate('/axfood/rest/v1/cart', { method: 'DELETE' });
		if (!res.ok) throw new Error(`Willys cart clear failed (${res.status})`);
		return this.getCart();
	}
}
```

- [ ] **Step 2: Write the live client test (self-cleaning cart round-trip)**

```ts
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import { WillysSession } from './session';
import { WillysClient } from './client';

const LIVE = process.env.WILLYS_LIVE === '1' && !!process.env.WILLYS_USERNAME && !!process.env.WILLYS_PASSWORD;
const d = LIVE ? describe : describe.skip;
const MILK = '101233933_ST';

d('WillysClient (live)', () => {
	let client: WillysClient;
	beforeAll(() => {
		const file = path.join(os.tmpdir(), `willys-client-session-${process.pid}.json`);
		client = new WillysClient(new WillysSession(process.env, file));
	});
	afterAll(async () => {
		await client.clearCart();
	});

	it('search returns category-enriched products', async () => {
		const results = await client.search('mjölk', 0, 5);
		expect(results.length).toBeGreaterThan(0);
		expect(results[0].productId).toMatch(/_ST$|_KG$/);
		expect(results.some((p) => p.categories.length > 0)).toBe(true);
	}, 60000);

	it('adds, reads back, and removes a product (reversible)', async () => {
		await client.clearCart();
		const afterAdd = await client.addToCart(MILK, 2);
		const line = afterAdd.lines.find((l) => l.productId === MILK);
		expect(line?.quantity).toBe(2);
		expect(line?.lineTotal.amount).toBeGreaterThan(0);

		const afterRemove = await client.removeFromCart(MILK);
		expect(afterRemove.lines.find((l) => l.productId === MILK)).toBeUndefined();
	}, 60000);
});
```

- [ ] **Step 3: Run the live test**

Run: `PATH="$HOME/.nvm/versions/node/v24.9.0/bin:$PATH" npm run test:willys -- src/lib/server/willys/client.test.ts`
Expected: PASS (2 tests); cart left empty.

- [ ] **Step 4: Commit**

```bash
git add src/lib/server/willys/client.ts src/lib/server/willys/client.test.ts
git commit -m "feat: willys client (search, product, cart) with category enrichment"
```

---

## Task 7: CLI

**Files:**
- Create: `src/lib/server/willys/cli.ts`

- [ ] **Step 1: Write the CLI**

```ts
#!/usr/bin/env node
import { WillysSession } from './session';
import { WillysClient } from './client';
import { WillysConfigError } from './config';
import os from 'node:os';
import path from 'node:path';

function log(msg: string): void {
	process.stderr.write(msg + '\n');
}
function out(data: unknown): void {
	process.stdout.write(JSON.stringify(data, null, 2) + '\n');
}

async function main(argv: string[]): Promise<number> {
	const [group, action, ...rest] = argv;
	const sessionFile = path.join(os.homedir(), '.willys-cli-session.json');
	const client = new WillysClient(new WillysSession(process.env, sessionFile));

	try {
		if (group === 'search') {
			const query = rest.join(' ') || action;
			if (!query) return usage();
			log(`Searching Willys for "${query}"…`);
			out(await client.search(query));
			return 0;
		}
		if (group === 'product' && action) {
			out(await client.product(action));
			return 0;
		}
		if (group === 'cart') {
			if (action === 'list' || !action) {
				out(await client.getCart());
				return 0;
			}
			if (action === 'add' && rest[0]) {
				const qty = rest[1] ? Number(rest[1]) : 1;
				log(`Adding ${rest[0]} ×${qty}…`);
				out(await client.addToCart(rest[0], qty));
				return 0;
			}
			if (action === 'remove' && rest[0]) {
				out(await client.removeFromCart(rest[0]));
				return 0;
			}
			if (action === 'clear') {
				out(await client.clearCart());
				return 0;
			}
		}
		return usage();
	} catch (err) {
		if (err instanceof WillysConfigError) {
			log(`Error: ${err.message}`);
			return 2;
		}
		log(`Error: ${err instanceof Error ? err.message : String(err)}`);
		return 1;
	}
}

function usage(): number {
	log(
		[
			'Usage:',
			'  willys search <query>',
			'  willys product <code>',
			'  willys cart list',
			'  willys cart add <code> [qty]',
			'  willys cart remove <code>',
			'  willys cart clear'
		].join('\n')
	);
	return 64;
}

main(process.argv.slice(2)).then((code) => process.exit(code));
```

- [ ] **Step 2: Live smoke test (search)**

Run: `PATH="$HOME/.nvm/versions/node/v24.9.0/bin:$PATH" npm run willys -- search "pasta"`
Expected: JSON array of normalized products on stdout; status lines on stderr.

- [ ] **Step 3: Live smoke test (reversible cart)**

Run:
```bash
PATH="$HOME/.nvm/versions/node/v24.9.0/bin:$PATH" npm run willys -- cart add 101233933_ST 1
PATH="$HOME/.nvm/versions/node/v24.9.0/bin:$PATH" npm run willys -- cart list
PATH="$HOME/.nvm/versions/node/v24.9.0/bin:$PATH" npm run willys -- cart remove 101233933_ST
```
Expected: cart shows the line after add, empty after remove.

- [ ] **Step 4: Commit**

```bash
git add src/lib/server/willys/cli.ts
git commit -m "feat: willys CLI"
```

---

## Task 8: Pi tools + agent wiring

**Files:**
- Create: `src/lib/server/agent/tools/willys.ts`
- Modify: `src/lib/server/agent/session.ts`

- [ ] **Step 1: Reconfirm the Pi tool API (read before coding)**

Read these to confirm signatures haven't drifted:
- `node_modules/@earendil-works/pi-coding-agent/dist/core/extensions/types.d.ts` — `ToolDefinition`, `defineTool`
- `node_modules/@earendil-works/pi-coding-agent/dist/core/sdk.d.ts` — `CreateAgentSessionOptions` (`customTools`, `noTools`)

Confirmed contract: `defineTool({ name, label, description, promptSnippet, parameters, execute })` where `parameters` is a `typebox` schema and `execute(id, params)` returns `{ content: [{ type: 'text', text }], details }`. Register via `createAgentSession({ customTools, noTools: 'builtin' })`.

- [ ] **Step 2: Write the Pi tools**

```ts
import { defineTool, type ToolDefinition } from '@earendil-works/pi-coding-agent';
import { Type } from 'typebox';
import { WillysClient } from '../../willys/client';
import { WillysConfigError } from '../../willys/config';

function ok(data: unknown): { content: { type: 'text'; text: string }[]; details: unknown } {
	return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }], details: data };
}

function fail(err: unknown): { content: { type: 'text'; text: string }[]; details: unknown } {
	const message =
		err instanceof WillysConfigError
			? err.message
			: `Willys tool error: ${err instanceof Error ? err.message : String(err)}`;
	return { content: [{ type: 'text', text: message }], details: { error: message } };
}

/** Build the native Pi tools that expose the Willys client to the agent. */
export function createWillysTools(client: WillysClient): ToolDefinition[] {
	return [
		defineTool({
			name: 'willys_search',
			label: 'Willys search',
			description:
				'Search Willys groceries. Returns structured products with productId, brand, price, price-per-unit, categories, and stock. Requires configured Willys credentials.',
			promptSnippet: 'willys_search(query): find groceries at Willys',
			parameters: Type.Object({
				query: Type.String({ description: 'Search text, e.g. "mjölk" or "pasta"' }),
				page: Type.Optional(Type.Number({ description: '0-based page', default: 0 })),
				size: Type.Optional(Type.Number({ description: 'Results per page (max 30)', default: 30 }))
			}),
			async execute(_id, params) {
				try {
					return ok(await client.search(params.query, params.page ?? 0, params.size ?? 30));
				} catch (err) {
					return fail(err);
				}
			}
		}),
		defineTool({
			name: 'willys_product',
			label: 'Willys product',
			description: 'Get detailed info for one Willys product by its productId (e.g. "101233933_ST").',
			promptSnippet: 'willys_product(productId): product detail',
			parameters: Type.Object({ productId: Type.String() }),
			async execute(_id, params) {
				try {
					return ok(await client.product(params.productId));
				} catch (err) {
					return fail(err);
				}
			}
		}),
		defineTool({
			name: 'willys_cart_view',
			label: 'Willys cart',
			description: 'View the current Willys shopping cart (lines, quantities, totals).',
			promptSnippet: 'willys_cart_view(): show the cart',
			parameters: Type.Object({}),
			async execute() {
				try {
					return ok(await client.getCart());
				} catch (err) {
					return fail(err);
				}
			}
		}),
		defineTool({
			name: 'willys_cart_add',
			label: 'Willys add to cart',
			description:
				'Add a product to the Willys cart. quantity is absolute for that product. pickUnit is "pieces" (default) or "kilogram".',
			promptSnippet: 'willys_cart_add(productId, quantity): add to cart',
			parameters: Type.Object({
				productId: Type.String(),
				quantity: Type.Number({ description: 'Absolute quantity to set', default: 1 }),
				pickUnit: Type.Optional(
					Type.Union([Type.Literal('pieces'), Type.Literal('kilogram')], { default: 'pieces' })
				)
			}),
			async execute(_id, params) {
				try {
					return ok(await client.setQuantity(params.productId, params.quantity, params.pickUnit ?? 'pieces'));
				} catch (err) {
					return fail(err);
				}
			}
		}),
		defineTool({
			name: 'willys_cart_remove',
			label: 'Willys remove from cart',
			description: 'Remove a product from the Willys cart by productId.',
			promptSnippet: 'willys_cart_remove(productId): remove from cart',
			parameters: Type.Object({ productId: Type.String() }),
			async execute(_id, params) {
				try {
					return ok(await client.removeFromCart(params.productId));
				} catch (err) {
					return fail(err);
				}
			}
		}),
		defineTool({
			name: 'willys_cart_clear',
			label: 'Willys clear cart',
			description: 'Remove all products from the Willys cart.',
			promptSnippet: 'willys_cart_clear(): empty the cart',
			parameters: Type.Object({}),
			async execute() {
				try {
					return ok(await client.clearCart());
				} catch (err) {
					return fail(err);
				}
			}
		})
	];
}
```

- [ ] **Step 3: Wire the tools into the agent session**

In `src/lib/server/agent/session.ts`:
1. Add imports at the top:
```ts
import path from 'node:path';
import { env } from '$env/dynamic/private';
import { WillysSession } from '../willys/session';
import { WillysClient } from '../willys/client';
import { createWillysTools } from './tools/willys';
```
2. In the init function, before `createAgentSession(...)`, build the client:
```ts
const willys = new WillysClient(
	new WillysSession(env, path.resolve(process.cwd(), 'data/willys/session.json'))
);
```
3. In the `createAgentSession({ ... })` options, change `noTools: 'all'` to `noTools: 'builtin'` and add:
```ts
customTools: createWillysTools(willys),
```
Keep the existing `resourceLoader`, `model`, `sessionManager`, etc. unchanged.

> Note on the system prompt: `prompt.ts` currently tells the user the agent has no tools. Update that sentence to say the agent can search Willys and manage the cart (see Task 9), so the persona matches reality.

- [ ] **Step 4: Type-check**

Run: `PATH="$HOME/.nvm/versions/node/v24.9.0/bin:$PATH" npm run check`
Expected: no errors.

- [ ] **Step 5: Live end-to-end agent test (manual)**

Start the dev server (`.claude/launch.json` "dev") and, in the chat UI, send:
`Search Willys for oat milk and tell me the cheapest option with its price per litre.`
Expected: the agent calls `willys_search`, a `tool` event shows in the UI, and the reply cites a real product with price-per-litre. Then: `Add two of the store-brand milk (101233933_ST) to my cart, then show me the cart.` → agent calls `willys_cart_add` + `willys_cart_view`; cart shows quantity 2. Finally remove it: `Clear my Willys cart.`

- [ ] **Step 6: Commit**

```bash
git add src/lib/server/agent/tools/willys.ts src/lib/server/agent/session.ts
git commit -m "feat: register Willys tools on the agent (noTools=builtin + customTools)"
```

---

## Task 9: Docs + final verification

**Files:**
- Modify: `src/lib/server/agent/prompt.ts`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update the system prompt**

In `src/lib/server/agent/prompt.ts`, replace the "no tools yet" wording with a short capability note, e.g.:
```
You can search the Willys online grocery store and manage the user's Willys
shopping cart (search products, view the cart, add/remove items). You cannot
place orders or check out. Always confirm what you added by showing the cart.
Use metric units.
```

- [ ] **Step 2: Update CLAUDE.md architecture section**

Add a bullet under Architecture describing `src/lib/server/willys/` (pure-HTTP Axfood client, login-gated, exposed as Pi tools + a `npm run willys` CLI), and note `data/willys/` holds the git-ignored session cache. Move the Willys line out of "Future milestones".

- [ ] **Step 3: Full gate**

Run:
```bash
PATH="$HOME/.nvm/versions/node/v24.9.0/bin:$PATH" npm run check
PATH="$HOME/.nvm/versions/node/v24.9.0/bin:$PATH" npm run lint
PATH="$HOME/.nvm/versions/node/v24.9.0/bin:$PATH" npm test
```
Expected: types clean, lint clean, all unit tests pass (live tests skipped).

- [ ] **Step 4: Live suite (with credentials)**

Run: `PATH="$HOME/.nvm/versions/node/v24.9.0/bin:$PATH" npm run test:willys`
Expected: session + client live tests pass; cart left empty afterward.

- [ ] **Step 5: Commit**

```bash
git add src/lib/server/agent/prompt.ts CLAUDE.md
git commit -m "docs: document Willys grocery tool; update agent persona"
```

---

## Self-review

**Spec coverage:**
- Login + encryption → Task 2 (crypto) + Task 5 (session.login). ✓
- Login gate / no anonymous use → Task 5 (`ensureAuthenticated`, uid check gates every `read`/`mutate`; client methods all go through them). ✓
- Credentials from `.env`, never logged → Task 1 (config) + Task 0 (.env.example); no secret is ever `console.log`'d. ✓
- CSRF for mutations → Task 5 (`mutate` + `getCsrfToken`). ✓
- Search with required fields → Task 4 (normalizeProduct) + Task 6 (search). ✓
- Categories (always enrich) → Task 6 (`categoriesFor`/`enrich`, concurrency-capped, cached). ✓
- Product detail → Task 6 (`product`). ✓
- Cart list/add/set-qty/remove/clear + normalized output → Task 4 + Task 6. ✓
- LLM-friendly structured output → Task 3 types + Task 4 normalizers. ✓
- Session persistence (0600, git-ignored) → Task 5 (`persist`) + Task 0 (.gitignore). ✓
- Exposed as Pi tools + CLI → Task 7 + Task 8. ✓
- Checkout excluded → no placeOrder/payment code anywhere. ✓

**Placeholder scan:** No TBD/TODO; every code step contains full code; commands have expected output. ✓

**Type consistency:** `WillysSession.read/mutate/ensureAuthenticated/getUid`, `WillysClient.search/product/getCart/setQuantity/addToCart/removeFromCart/clearCart`, `normalizeProduct(raw, categories)`, `normalizeCart(raw, storeId)`, `encryptCredential → {str,key}`, `loadWillysConfig(env) → {username,password}` are used consistently across Tasks 4–8. `pickUnit` values `'pieces'|'kilogram'` are consistent between client, tools, and Willys API. ✓

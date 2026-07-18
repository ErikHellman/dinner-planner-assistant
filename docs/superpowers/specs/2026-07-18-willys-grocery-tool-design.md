# Willys grocery tool — design

- **Date:** 2026-07-18
- **Status:** Approved (design); implementation plan to follow
- **Milestone:** Online grocery store tool for the Dinner Planner Assistant
- **Scope owner:** single-user app; the user's own Willys account

## Goal

Give the dinner-planning Pi agent a deterministic tool to **search Willys
groceries and manage the user's online shopping cart** (list, add, update
quantity, remove, clear). Output must be structured for LLM consumption.

**In scope:** login, login-state gating, product search (category-enriched),
product detail, and cart management.

**Explicitly out of scope (do NOT implement):** checkout, `placeOrder`,
payment, and delivery-slot booking. Those endpoints exist but must not be
implemented or exposed by this tool.

## Hard requirements (from the request)

1. The tool must not function unless **credentials are present AND an
   authenticated session exists**. Anonymous use of the Willys backend must be
   impossible through the tool — even though Willys itself allows anonymous
   search, the tool gates every operation behind login.
2. Credentials come from `.env` as `WILLYS_USERNAME` (Swedish personnummer,
   12 digits) and `WILLYS_PASSWORD`. Never log, print, or commit them.
3. Search output includes name, productId, manufacturer/brand, price, price
   per unit + the unit, categories, and stock — in a structured format.
4. Cart output is normalized so the agent can verify contents: product details
   + quantity per line, line totals, and cart totals.

## Verified findings (reverse-engineered and tested live)

Willys runs the **Axfood / SAP-Hybris** commerce backend (same platform as the
existing `hemkop` CLI on this machine; product codes are `{id}_{unit}`, e.g.
`101233933_ST`). The frontend is Next.js but all data is same-origin JSON on
`https://www.willys.se`. **No headless browser is required** — a plain HTTP
client with a cookie jar is sufficient. All of the below was confirmed against
the live site with the user's account (uid `000f5w1y`), and any cart mutation
made during investigation was reverted (cart left empty).

### Authentication

Credentials are encrypted **client-side** before login (symmetric, self-
contained — fully reproducible in Node `crypto`):

- passphrase = 16 random chars (sent in cleartext as the `_key` field)
- AES key = `PBKDF2(passphrase, salt=16 random bytes, iterations=1000,
  hash=SHA-1, keyLen=16)`
- ciphertext = `AES-128-CBC(plaintext, iv=16 random bytes)` (PKCS7 padding)
- encoded value = `base64( ivHex + "::" + saltHex + "::" + base64(ciphertext) )`

Login flow:

1. `GET /` → obtain the `__Host-csrf-token` cookie.
2. `POST /login` (JSON) with the encrypted fields:
   `{ j_username, j_username_key, j_password, j_password_key, j_remember_me }`,
   sending the `__Host-csrf-token` value as the `x-csrf-token` header.
   → `200 {"login_successful":"true"}` and session cookies
   (`JSESSIONID`, `acceleratorSecureGUID`, `axfoodRememberMe`, `ROUTE`).

### Login-state gate

`GET /axfood/rest/v1/customer` → `uid` is `"anonymous"` when unauthenticated,
and the real uid (+ `name`) when logged in. Used as the precondition check for
every tool call.

### CSRF for mutations

Reads need only the session cookies. **Mutations require a session-bound CSRF
token**: `GET /axfood/rest/v1/csrf-token` returns a UUID string; send it as the
`X-CSRF-Token` header on every `POST`/`DELETE`. Note: fetching the token
rotates `JSESSIONID` (the rotated session stays authenticated), so fetch it
**after** login. Missing token → `401`; correct token but bad args → `400`.

### Search

`GET /axfood/rest/v1/search?q={query}&page={0}&size={<=30}` (anonymous-capable,
but gated by the tool). Per-product fields include: `code` (productId), `name`,
`manufacturer`, `productLine2` (brand + size), `price`/`priceValue`/
`priceNoUnit`, `comparePrice` + `comparePriceUnit` (price per unit, e.g.
"10,60 kr" per "l"), `priceUnit` (e.g. "kr/st"), `productBasketType` (`ST`/`KG`),
`displayVolume`, `labels`, `online`, `outOfStock`, `addToCartDisabled`,
`incrementValue`, `notAllowedAnonymous`, `image`/`thumbnail`. Search hits do
**not** carry the category taxonomy (only `googleAnalyticsCategory`).

### Product detail + categories

`GET /axfood/rest/v1/p/{code}` returns `breadcrumbs` (full category path, e.g.
*Alla varor › Mejeri, ost & ägg (N04) › Mjölk (N0402) › Mellanmjölk*) plus
`googleAnalyticsCategory`. Used to enrich search hits with categories.

### Cart

- `GET /axfood/rest/v1/cart` — cart; items in `products[]`, plus `totalItems`,
  `subTotalPrice`, `totalDepositSum`, discount fields, active store, etc.
- `POST /axfood/rest/v1/cart/addProduct?productCodePost={code}&qty={n}&pickUnit={pieces|kilogram}`
  — add/update; `qty` is **absolute** (not a delta); `qty=0` removes the line.
  Requires the `X-CSRF-Token` header.
- `POST /axfood/rest/v1/cart/addProducts` (JSON body) — batch add.
- `DELETE /axfood/rest/v1/cart` — clear the cart (requires `X-CSRF-Token`).

**`pickUnit` mapping** (from `productBasketType.code`): `ST → "pieces"`,
`KG → "kilogram"`. The raw `ST`/`KG` is rejected with `{error.illegal.argument}`.

Cart entry fields (verified): `code`, `name`, `quantity`, `pickQuantity`,
`pickUnit`/`unit` (`{code:"pieces", name:"st"}`), `price` (unit price),
`priceValue`, `totalPrice` (line total), `comparePrice` + `comparePriceUnit`,
`productLine2`, `displayVolume`, `manufacturer`, `categoryName`, `categoryCode`,
`googleAnalyticsCategory`, `totalDiscount`, `totalDeposit`, `outOfStock`,
`image`.

### Store context

The cart is bound to an active store (`GET /axfood/rest/v1/store/active` →
default `{"id":"2583"}`, an online store). Adding to cart worked with this
default and **no** delivery-mode/postal-code selection. Store/postal-code-
specific pricing is a possible future add-on, not built now.

## Architecture

Shared TypeScript client library, exposed both as native Pi tools (for the
agent) and as a thin CLI (for standalone testing / manual use). One source of
truth; the agent gets no shell access (preserves the bootstrap's `noTools`
security stance).

```
src/lib/server/willys/
  config.ts     — read WILLYS_USERNAME/PASSWORD from env; throw if absent
  crypto.ts     — replicate the credential encryption (pure, unit-testable)
  session.ts    — login, cookie jar, CSRF fetch, persistence, auto-relogin,
                  login-GATE (uid must be non-anonymous before any op)
  client.ts     — typed methods: search, product, getCart, addToCart,
                  setQuantity, removeFromCart, clearCart (handles cookies+CSRF)
  normalize.ts  — raw Axfood JSON → LLM-friendly structured output
  types.ts      — shared types
  cli.ts        — thin CLI wrapper (data→stdout, status→stderr, mirrors hemkop)

src/lib/server/agent/tools/willys.ts
                — native Pi tools wrapping the client; registered with the
                  agent session (replace `noTools:'all'` with a curated set
                  containing only these tools)
```

### Pi tool surface

All tools first ensure creds present + authenticated session (auto-login if
needed); otherwise they return a clear error and do nothing.

| Tool | Params | Returns |
|---|---|---|
| `willys_search` | `query`, `page?`, `size?` | normalized products (category-enriched) |
| `willys_product` | `productId` | one detailed normalized product |
| `willys_cart_view` | — | normalized cart |
| `willys_cart_add` | `productId`, `quantity`, `pickUnit?` | updated cart (echo added line + new totals) |
| `willys_cart_set_quantity` | `productId`, `quantity` | updated cart (`0` removes) |
| `willys_cart_remove` | `productId` | updated cart |
| `willys_cart_clear` | — | empty-cart confirmation |

### CLI surface (mirrors hemkop)

`willys search <query>`, `willys product <code>`, `willys cart list|add <code>
[qty]|remove <code>|clear`. Status/logs → stderr, JSON data → stdout.

## Normalized output (LLM-friendly)

Search / product hit:

```json
{
  "productId": "101233933_ST",
  "name": "Mellanmjölk Längre Hållbarhet 1,5%",
  "brand": "Garant",
  "displaySize": "1,5l",
  "pickUnit": "pieces",
  "price": { "amount": 15.90, "formatted": "15,90 kr", "currency": "SEK" },
  "unitPrice": { "amount": 10.60, "unit": "l", "formatted": "10,60 kr/l" },
  "categories": ["Mejeri, ost & ägg", "Mjölk", "Mellanmjölk"],
  "categoryCode": "N0402",
  "labels": ["swedish_flag", "from_sweden"],
  "inStock": true,
  "imageUrl": "https://assets.axfood.se/image/upload/.../07340083443893_C1L1_s06"
}
```

Cart:

```json
{
  "store": { "id": "2583" },
  "itemCount": 1,
  "totalQuantity": 2,
  "lines": [
    {
      "productId": "101233933_ST",
      "name": "Mellanmjölk Längre Hållbarhet 1,5%",
      "brand": "Garant",
      "quantity": 2,
      "pickUnit": "pieces",
      "unitPrice": { "amount": 15.90, "formatted": "15,90 kr" },
      "lineTotal": { "amount": 31.80, "formatted": "31,80 kr" },
      "categories": ["Mejeri, ost & ägg", "Mjölk"],
      "displaySize": "1,5l"
    }
  ],
  "subtotal": { "amount": 31.80, "formatted": "31,80 kr" },
  "deposit": { "amount": 0, "formatted": "0,00 kr" },
  "discountTotal": { "amount": 0, "formatted": "0,00 kr" }
}
```

Cart tools also return a compact markdown table rendering so the agent can echo
cart contents back to the user for verification.

## Security & session management

- Refuse all operations unless `WILLYS_USERNAME` + `WILLYS_PASSWORD` are present
  and the session authenticates (`uid !== "anonymous"`).
- Persist session cookies in a git-ignored `data/willys/session.json` (mode
  `0600`); reuse across calls; re-login on `401`/expiry, then re-fetch the CSRF
  token.
- Never log, print, or persist credentials, the derived ciphertext, session
  cookies, or the CSRF token. `data/willys/` is git-ignored.

## Error handling

- Missing creds → typed `WillysConfigError`, surfaced as a clear tool error.
- Auth failure (bad creds / session can't reach non-anonymous) → clear error;
  instruct to verify credentials.
- `401` on a mutation → refresh session + CSRF and retry once, then fail.
- `400 {error.*}` → surface as an invalid-argument error naming the operation.
- Product not addable (`addToCartDisabled`/`outOfStock`) → report, don't retry.

## Testing strategy

- **Unit (Vitest):** `crypto.ts` round-trip against fixed salt/iv/passphrase
  vectors; `normalize.ts` raw-fixture → expected output.
- **Integration (live, gated on env creds; skipped in CI):** login →
  non-anonymous; search returns hits; reversible cart round-trip
  (add → verify line/totals → remove → assert empty).

## Implementation phases

1. `crypto` + `config` + `session`/login + login-gate. Unit tests for crypto;
   live login test.
2. `search` + product detail + `normalize` + category enrichment (batched,
   cached by code, concurrency-capped).
3. Cart view / add / set-quantity / remove / clear + normalize. Reversible live
   round-trip test.
4. CLI wrapper.
5. Register native Pi tools; wire into the agent (curated tool set); update
   chat UI tool-event labels; update `CLAUDE.md`.

## Open considerations / future

- **Store/postal-code selection** for store-specific pricing & availability
  (not needed to populate a cart; add later if required).
- **Category-enrichment cost:** "always enrich" means N product-detail calls
  per search page — cap `size`, cache detail by code, and limit concurrency.
- **Politeness:** realistic `User-Agent`, small retry/backoff on transient 5xx.
- Later milestone: expose the tool as a Pi **skill** package if/when the agent
  gains a controlled exec path (mirrors the `hemkop` skill model).

## Risks

- Willys could change the client-side encryption scheme or endpoint shapes;
  isolation in `willys/` keeps the blast radius small, and `crypto.ts` is the
  only interop-fragile piece.
- CSRF/session rotation behavior is subtle (token must be fetched post-login);
  covered by the integration test.

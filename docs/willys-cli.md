# Willys grocery CLI

A small command-line tool for searching the [Willys](https://www.willys.se) online
grocery store and managing your shopping cart from the terminal. It's a thin wrapper
around the same login-gated client (`src/lib/server/willys/`) that powers the
dinner-planner agent's Willys tools, so anything the CLI can do, the agent can do too.

It can **search products, look up product details, and view / add / remove / clear the
cart**. It deliberately **cannot check out or place an order**.

## Prerequisites

- **Node 24.9.0** (see `.nvmrc`). The Pi SDK needs Node ≥ 22.19; the machine's default
  nvm Node (22.14) is too old. Use one of:
  - `nvm use` (from the project root), or
  - prefix commands with `PATH="$HOME/.nvm/versions/node/v24.9.0/bin:$PATH"`.
- **Willys credentials** in `.env` (git-ignored). The tool refuses to run without them —
  there is no anonymous mode.

```bash
# .env  (see .env.example)
WILLYS_USERNAME=YYYYMMDDNNNN     # your Swedish personnummer or Willys Plus number
WILLYS_PASSWORD=your-password    # the "Lösenord" login, not BankID
```

The CLI caches its authenticated session (cookies only) at `~/.willys-cli-session.json`
with `0600` permissions and reuses it across runs, logging in again automatically when it
expires. Your password is never written to disk or printed.

## Running it

The tool is exposed as the `willys` npm script:

```bash
npm run willys -- <command>
```

Everything after `--` is passed to the CLI.

> **Piping the JSON?** `npm run` prints its own banner line to stdout ahead of the tool's
> output, which breaks `jq`/`JSON.parse`. For clean, parseable JSON use `--silent`:
>
> ```bash
> npm run --silent willys -- search "pasta" | jq '.[0]'
> ```
>
> …or invoke the CLI directly (bypassing npm entirely):
>
> ```bash
> node --env-file=.env --import tsx src/lib/server/willys/cli.ts search "pasta"
> ```

## Commands

| Command                 | What it does                                                                           |
| ----------------------- | -------------------------------------------------------------------------------------- |
| `search <query>`        | Search products. Query may be multiple words. Returns up to 30 hits.                   |
| `product <code>`        | Full details for one product by its productId (e.g. `101233933_ST`).                   |
| `cart list`             | Show the current cart (lines, quantities, totals). Also the default for a bare `cart`. |
| `cart add <code> [qty]` | Set this product's quantity in the cart. `qty` defaults to `1`.                        |
| `cart remove <code>`    | Remove a product from the cart.                                                        |
| `cart clear`            | Empty the cart.                                                                        |

Running the CLI with no/unknown arguments prints the usage summary.

### Examples

```bash
# Search (multi-word queries work)
npm run --silent willys -- search "krossade tomater"

# Product detail
npm run --silent willys -- product 101233933_ST

# View the cart
npm run --silent willys -- cart list

# Add 2 of a product (sets the quantity to exactly 2)
npm run --silent willys -- cart add 101233933_ST 2

# Remove it again
npm run --silent willys -- cart remove 101233933_ST

# Empty the cart
npm run --silent willys -- cart clear
```

Product codes come from the `productId` field in `search` / `product` output. They follow
the format `{id}_{unit}`, where the unit is `ST` (pieces) or `KG` (kilogram).

## Output

- **Structured data → stdout** as pretty-printed JSON.
- **Status/progress and errors → stderr** as plain text.

This split means you can safely pipe stdout into `jq` or redirect it to a file without the
status lines getting in the way:

```bash
npm run --silent willys -- search "havredryck" > oatmilk.json
npm run --silent willys -- search "havredryck" | jq '[.[] | {productId, name, unitPrice: .unitPrice.formatted}]'
```

### Exit codes

| Code | Meaning                                                             |
| ---- | ------------------------------------------------------------------- |
| `0`  | Success                                                             |
| `1`  | Runtime error (e.g. network failure, login failed)                  |
| `2`  | Configuration error (missing `WILLYS_USERNAME` / `WILLYS_PASSWORD`) |
| `64` | Usage error (unknown command, or a bad `qty`)                       |

### Example: a search hit

Each `search` result (and the `product` command) is a normalized product object:

```json
{
	"productId": "101233933_ST",
	"name": "Mellanmjölk Längre Hållbarhet 1,5%",
	"brand": "Garant",
	"displaySize": "1,5l",
	"pickUnit": "pieces",
	"price": { "amount": 15.9, "formatted": "15,90 kr", "currency": "SEK" },
	"unitPrice": { "amount": 10.6, "unit": "l", "formatted": "10,60 kr/l" },
	"categories": ["Mejeri, ost & ägg", "Mjölk", "Mellanmjölk"],
	"categoryCode": "N0402",
	"labels": ["swedish_flag", "from_sweden"],
	"inStock": true,
	"addable": true,
	"imageUrl": "https://assets.axfood.se/image/upload/..."
}
```

`price` is the pack price; `unitPrice` is the comparison price per unit (e.g. per litre).

### Example: the cart

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
			"unitPrice": { "amount": 15.9, "formatted": "15,90 kr", "currency": "SEK" },
			"lineTotal": { "amount": 31.8, "formatted": "31,80 kr", "currency": "SEK" },
			"categories": ["Mejeri, ost & ägg"],
			"displaySize": "1,5l"
		}
	],
	"subtotal": { "amount": 31.8, "formatted": "31,80 kr", "currency": "SEK" },
	"deposit": { "amount": 0, "formatted": "0,00 kr", "currency": "SEK" },
	"discountTotal": { "amount": 0, "formatted": "0,00 kr", "currency": "SEK" }
}
```

## Notes & limitations

- **Quantity is absolute, not additive.** `cart add <code> 3` sets the line to 3, whether
  it was previously 0, 1, or 5. To remove, use `cart remove` (or `cart add <code> 0`).
- **Search returns one page of up to 30 results.** There's no paging flag in the CLI; the
  underlying client supports it if you need more.
- **The CLI adds items as `pieces`.** Weight-priced products (codes ending in `_KG`) can't
  be added through the CLI — use the agent's `willys_cart_add` tool, which accepts a
  `pickUnit` of `kilogram`.
- **The cart can lag for a moment after a change.** Willys' backend is eventually
  consistent, so a `cart list` immediately after an `add`/`remove` may still show the old
  state briefly. Re-run `cart list` to confirm.
- **No checkout.** Placing an order is intentionally out of scope; the CLI only manages the
  cart contents.
- **Login required, always.** Every command authenticates first; nothing works anonymously.

## Troubleshooting

| Symptom                                                                                       | Cause / fix                                                                                                                                         |
| --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Error: Willys credentials missing: set WILLYS_USERNAME and WILLYS_PASSWORD in .env` (exit 2) | Add both variables to `.env`.                                                                                                                       |
| `Error: Willys login failed — verify WILLYS_USERNAME and WILLYS_PASSWORD.` (exit 1)           | Wrong username/password, or the account uses BankID-only login. Confirm the "Lösenord" login works at <https://www.willys.se/anvandare/inloggning>. |
| Cannot find module / syntax errors when running                                               | Wrong Node version. Run `nvm use` (Node 24.9.0) or prefix with the `PATH="…v24.9.0/bin:$PATH"` shown above.                                         |
| Extra `> dinner-planner-assistant@… willys` line in piped output                              | That's npm's banner. Use `npm run --silent willys -- …` or invoke `node …` directly.                                                                |

## Related

- The same operations are available to the dinner-planner agent as native tools
  (`willys_search`, `willys_product`, `willys_cart_view`, `willys_cart_add`,
  `willys_cart_remove`, `willys_cart_clear`) — see `src/lib/server/agent/tools/willys.ts`.
- Client library: `src/lib/server/willys/`. Design spec:
  `docs/superpowers/specs/2026-07-18-willys-grocery-tool-design.md`.

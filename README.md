# Dinner Planner Assistant

A single-user fullstack web app for planning a week of dinners together with an
LLM agent — and having the groceries end up in a real online shopping cart.

You chat with the agent in Swedish ("planera fyra middagar den här veckan, inget
fläsk, max 30 minuter"), it searches a local recipe database, aggregates the
ingredients into a deterministic shopping list, and fills your Willys
(willys.se) cart with matching products. The app then shows you the week's
recipes and lets you adjust quantities in the cart before you check out
yourself — checkout is deliberately **not** something the agent can do.

## Demo

https://github.com/user-attachments/assets/4bd39dbe-0713-435f-bafd-c2690c52d92f

## What's in the app

Five tabs (bottom nav on mobile, top bar on desktop), all in Swedish:

| Tab                | Route             | What it does                                                                          |
| ------------------ | ----------------- | ------------------------------------------------------------------------------------- |
| **Planera**        | `/`               | Streaming chat with the agent, with live tool-activity status                         |
| **Varukorg**       | `/varukorg`       | The live Willys cart — edit quantities, remove items, empty it                        |
| **Veckans recept** | `/veckans-recept` | The stored plan for an ISO week: recipes, shopping list, cart check, `Ny`/`Beställd`  |
| **Alla recept**    | `/recept`         | Browse and search the harvested recipe database, mark favourites and never-agains     |
| **Inställningar**  | `/installningar`  | Food preferences, allergies, extra prompt instructions, LLM provider and Willys login |

Recipe pages print to a clean A4 sheet (`Skriv ut`), without the images, chips
or buttons.

## How it works

- **SvelteKit 2 + Svelte 5 (runes)** with `adapter-node` — no separate backend.
  API routes live in `src/routes/api/`.
- **[Pi](https://pi.dev)** (`@earendil-works/pi-coding-agent`) is the agent
  harness. The agent runs with no builtin tools (no shell, no file access) and
  fifteen native custom tools instead:
  - Willys: `willys_search`, `willys_product`, `willys_cart_view`,
    `willys_cart_add`, `willys_cart_remove`, `willys_cart_clear`
  - Recipes: `recipe_search`, `recipe_get`, `recipe_ingredients`,
    `recipe_aggregate`
  - Plans: `plan_get`, `plan_history`, `plan_record_cart`, `plan_cart_diff`,
    `plan_delete`
- **Recipe database** — ~200 recipes scraped from Linas matkasse's public
  "Kalorisnål" receptbank into `data/recipes/` (JSON + hero images, committed to
  git, 2 servings each). No login needed.
- **Ingredient aggregation** is deterministic TypeScript, not LLM work: volume
  units merge in ml, pantry staples are split out, amounts are scaled from the
  stored 2 servings. This keeps the shopping list from hallucinating.
- **Willys client** (`src/lib/server/willys/`) is a pure-HTTP reverse-engineered
  client for the Axfood/Hybris backend. It is login-gated — there is no
  anonymous mode.
- **Weekly plans** are stored per ISO week as `data/plans/<YYYY>-Www.json`
  (recipes, servings, shopping list, cart snapshot, and a `new`/`ordered`
  status you toggle from the Veckans recept tab).
- **The agent remembers past weeks.** `plan_history` gives it a compact summary
  of recently planned weeks, so it can avoid serving you the same dish three
  weeks running and answer "what have we been eating a lot of".
- **The cart is checked, not just claimed.** As it shops, the agent records
  which shopping-list item each product was bought for. That mapping turns into
  exact set arithmetic — no fuzzy name matching — so both the agent
  (`plan_cart_diff`) and the Veckans recept tab can say plainly which
  ingredients nothing was bought for. Catching one silently-missed ingredient
  is the whole point.
- **Preferences accumulate from use.** Beyond the free-text preferences in
  Inställningar, every recipe has `Favorit` / `Aldrig igen` toggles. Favourites
  become a preference in the system prompt and never-agains a hard constraint,
  worded alongside your allergies. Verdicts are read when a chat session
  starts, so one set mid-conversation applies from the next `Ny chatt`.

`src/lib/server/agent/` is deliberately isolated so the agent could be pulled
out into its own service later. Architecture details for contributors are in
[CLAUDE.md](CLAUDE.md).

## Setup

### 1. Node 24.9.0

The Pi SDK requires Node >= 22.19, which is newer than many default nvm
installs. The version is pinned in [`.nvmrc`](.nvmrc) and `engine-strict` is on:

```sh
nvm install   # picks up .nvmrc
nvm use
node -v       # v24.9.0
```

If you don't want to switch shells, prefix commands with
`PATH="$HOME/.nvm/versions/node/v24.9.0/bin:$PATH"`.

### 2. Install dependencies

```sh
npm install
```

### 3. Configure `.env`

Copy the template and fill it in:

```sh
cp .env.example .env
```

```sh
# Which LLM the Pi agent uses. See https://pi.dev/docs/latest/providers
PI_PROVIDER=anthropic
PI_MODEL=claude-sonnet-5

# API key for the chosen provider — the variable name follows the
# <PROVIDER>_API_KEY convention (OPENAI_API_KEY for PI_PROVIDER=openai, …)
ANTHROPIC_API_KEY=sk-ant-…

# Willys online grocery: your Swedish personnummer (YYYYMMDDNNNN) or Willys Plus
# number, plus the willys.se password. Password login, not BankID.
WILLYS_USERNAME=
WILLYS_PASSWORD=
```

Both blocks are optional in the sense that the app still boots without them:

- **No API key** → the app runs and shows a banner; chat returns a clear error.
- **No Willys credentials** → recipes and plans work, but every grocery tool
  fails with a "credentials missing" error.

Your Willys credentials are used only to talk to willys.se from your own
machine. The authenticated session is cached under `data/willys/` and is
git-ignored — as is `.env` itself.

`.env` is the fallback layer: anything you set in the **Inställningar** tab
(provider, model, API key, Willys login, food preferences) is stored in
`data/settings.json` and wins over the matching variable. The two secrets are
encrypted at rest with a key auto-generated in `data/settings.key`, and never
reach the browser — the UI only reports whether a value came from settings or
`.env`. Saving restarts the agent session, since the provider, model and prompt
are baked in when it starts.

### 4. Run it

```sh
npm run dev          # http://localhost:5173
```

Production:

```sh
npm run build
npm start            # loads .env, serves the adapter-node build
```

The recipe database is committed, so there is nothing to harvest before the
first run. To refresh it later:

```sh
npm run recipes -- harvest
```

## Deploy with Docker

Production deployment runs the adapter-node build in a container (requires
Docker with Compose v2.24+). From a checkout of the repo:

```sh
docker compose up -d --build
```

The app serves on http://localhost:3000 (loopback only — see the HTTPS
section below for exposing it). `./data` is bind-mounted into the
container, so recipes, plans, sessions, verdicts and settings remain plain
JSON files you can view and edit from the host — the committed
`data/recipes/` library is picked up as-is, and the app creates everything
else on demand.

- **ORIGIN**: if the app is reached at anything other than
  `http://localhost:3000` (other port, hostname, reverse proxy), set `ORIGIN`
  to the public URL (in `.env` or the shell) — otherwise SvelteKit's CSRF
  protection rejects all mutating requests. The HTTPS setup below depends on
  this.
- **Configuration**: a `.env` in the project root is loaded if present (same
  variables as `.env.example`); everything in it can instead be set at
  runtime from the Inställningar tab (stored in `data/settings.json`, which
  wins over env).
- **Linux hosts**: the container runs as user `node` (uid 1000), which must
  be able to write `./data` (`sudo chown -R 1000:1000 data`). Alternatively
  run as your own uid via `user:` in a compose override — then also set
  `PI_CODING_AGENT_DIR=/app/data/.pi` in `environment`, since `$HOME` won't
  be writable. On macOS/Windows Docker Desktop no ownership tweaks are
  needed.

### HTTPS

The compose file includes a [Caddy](https://caddyserver.com) reverse proxy
behind the `https` profile. Caddy terminates TLS and obtains + renews the
Let's Encrypt certificate automatically — there is no certbot or manual
renewal. The app container itself stays HTTP on the internal network
(published on loopback only).

Manual steps, assuming the hostname `dinnerplan.hellman.io`:

1. **DNS**: create an A record (and AAAA for IPv6) for `dinnerplan.hellman.io`
   pointing at the server's public IP.
2. **Ports**: open/forward **80 and 443** to the Docker host. Port 80 must be
   reachable from the internet — Let's Encrypt's HTTP challenge and the
   HTTP→HTTPS redirect both use it.
3. **Hostname**: `Caddyfile` in the repo root is preconfigured for
   `dinnerplan.hellman.io`; edit the site address if you deploy under another
   name.
4. **ORIGIN**: add `ORIGIN=https://dinnerplan.hellman.io` to `.env`. Without
   it the UI loads but every save fails (CSRF).
5. **Auth** (strongly recommended): the app has no login of its own, and
   exposing it publicly lets anyone chat on your LLM credits and edit your
   cart. Generate a hash with `docker run --rm -it caddy:2 caddy
hash-password` and uncomment the `basic_auth` block in `Caddyfile`.
6. Start everything:

   ```sh
   docker compose --profile https up -d
   ```

   (Without `--profile https` the compose file behaves as before: app only,
   plain HTTP on localhost.)
7. Verify: `curl -I https://dinnerplan.hellman.io/api/health`. First
   certificate issuance takes a few seconds after startup; check `docker
compose logs caddy` if it does not come up.

Certificates and the ACME account are stored in the `caddy_data` named volume
and survive restarts and rebuilds — do not delete it casually, or you may run
into Let's Encrypt rate limits.

## Commands

| Command                   | Purpose                                                   |
| ------------------------- | --------------------------------------------------------- |
| `npm run dev`             | Dev server on :5173                                       |
| `npm run build` / `start` | Production build and serve                                |
| `docker compose up -d`    | Production deployment in Docker (`./data` bind-mounted)   |
| `npm run check`           | `svelte-check` / TypeScript                               |
| `npm run lint`            | Prettier check + eslint (`npm run format` fixes)          |
| `npm test`                | Unit tests (Vitest, `server` + `client` projects)         |
| `npm run test:recipes`    | Live site-contract tests against Linas matkasse (network) |
| `npm run test:willys`     | Live Willys contract tests (network, needs credentials)   |

### Recipe CLI

```sh
npm run recipes -- harvest [--force] [--limit N]
npm run recipes -- search [--query q] [--category c] [--max-time 30] [--max-kcal 600]
npm run recipes -- get <recipeId>
npm run recipes -- ingredients <recipeId...>
npm run recipes -- aggregate <recipeId...> --servings 4 --week 2026-W30
```

`aggregate` writes the week's plan document.

### Willys CLI

Drives the same client as the agent tools:

```sh
npm run willys -- search mjölk
npm run willys -- product <code>
npm run willys -- cart list
npm run willys -- cart add <code> [qty]         # sets an exact quantity
npm run willys -- cart remove <code>
npm run willys -- cart clear
npm run willys -- cart record --week 2026-W30   # snapshot cart into the plan
```

`cart record` stores no ingredient-to-product mapping — only the agent knows
which item each product was bought for — so a week recorded this way shows its
coverage as unknown.

`npm run` prints a banner line to stdout, so use `npm run --silent …` when
piping the JSON output. More detail in [docs/willys-cli.md](docs/willys-cli.md).

The CLI keeps its own session cache at `~/.willys-cli-session.json`, separate
from the app's.

## Data layout

| Path                          | Tracked | Contents                                               |
| ----------------------------- | ------- | ------------------------------------------------------ |
| `data/recipes/`               | yes     | Harvested recipe JSON + hero images                    |
| `data/plans/`                 | no      | One `<YYYY>-Www.json` weekly plan per ISO week         |
| `data/sessions/`              | no      | Pi session JSONL — read these when debugging a turn    |
| `data/willys/`                | no      | Cached authenticated Willys session (auth cookies)     |
| `data/settings.json` + `.key` | no      | Inställningar document and its secret-encryption key   |
| `data/verdicts.json`          | no      | Per-recipe `Favorit` / `Aldrig igen` verdicts          |
| `data/preferences/`           | —       | Leftover placeholder; preferences live in settings now |

## Status

Done: the 5-tab web UI, streaming chat, the Willys client and agent tools, the
recipe database, ingredient aggregation, week-keyed plans, the settings /
food-preference document, plan history, cart coverage checking and recipe
verdicts.

Not yet built: the recipe database still only covers the "Kalorisnål" category
(~200 recipes), which is the main ceiling on suggestion quality — re-run the
harvest to widen it. Hemköp support is a plausible second store; a working
Hemköp CLI already exists on the author's machine and could be wrapped the same
way Willys is.

Known rough edge: cart coverage depends on the agent passing the mapping. If it
forgets, ingredients show as unchecked rather than falsely complete — safe, but
noisy. Plans recorded before the feature existed say so instead of guessing.

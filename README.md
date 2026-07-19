# Dinner Planner Assistant

A single-user fullstack web app for planning a week of dinners together with an
LLM agent — and having the groceries end up in a real online shopping cart.

You chat with the agent in Swedish ("planera fyra middagar den här veckan, inget
fläsk, max 30 minuter"), it searches a local recipe database, aggregates the
ingredients into a deterministic shopping list, and fills your Willys
(willys.se) cart with matching products. The app then shows you the week's
recipes and lets you adjust quantities in the cart before you check out
yourself — checkout is deliberately **not** something the agent can do.

The longer-term product thinking behind this lives in
[Project plan and description - Dinner planner assistant.md](Project%20plan%20and%20description%20-%20Dinner%20planner%20assistant.md).

## What's in the app

Four tabs (bottom nav on mobile, top bar on desktop), all in Swedish:

| Tab                | Route             | What it does                                                             |
| ------------------ | ----------------- | ------------------------------------------------------------------------ |
| **Planera**        | `/`               | Streaming chat with the agent, with live tool-activity status            |
| **Varukorg**       | `/varukorg`       | The live Willys cart — edit quantities, remove items, empty it           |
| **Veckans recept** | `/veckans-recept` | The stored plan for an ISO week: recipes, shopping list, `Ny`/`Beställd` |
| **Alla recept**    | `/recept`         | Browse and search the harvested recipe database                          |

## How it works

- **SvelteKit 2 + Svelte 5 (runes)** with `adapter-node` — no separate backend.
  API routes live in `src/routes/api/`.
- **[Pi](https://pi.dev)** (`@earendil-works/pi-coding-agent`) is the agent
  harness. The agent runs with no builtin tools (no shell, no file access) and
  thirteen native custom tools instead:
  - Willys: `willys_search`, `willys_product`, `willys_cart_view`,
    `willys_cart_add`, `willys_cart_remove`, `willys_cart_clear`
  - Recipes: `recipe_search`, `recipe_get`, `recipe_ingredients`,
    `recipe_aggregate`
  - Plans: `plan_get`, `plan_record_cart`, `plan_delete`
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

## Commands

| Command                   | Purpose                                                   |
| ------------------------- | --------------------------------------------------------- |
| `npm run dev`             | Dev server on :5173                                       |
| `npm run build` / `start` | Production build and serve                                |
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

`npm run` prints a banner line to stdout, so use `npm run --silent …` when
piping the JSON output. More detail in [docs/willys-cli.md](docs/willys-cli.md).

The CLI keeps its own session cache at `~/.willys-cli-session.json`, separate
from the app's.

## Data layout

| Path                | Tracked | Contents                                            |
| ------------------- | ------- | --------------------------------------------------- |
| `data/recipes/`     | yes     | Harvested recipe JSON + hero images                 |
| `data/plans/`       | no      | One `<YYYY>-Www.json` weekly plan per ISO week      |
| `data/sessions/`    | no      | Pi session JSONL — read these when debugging a turn |
| `data/willys/`      | no      | Cached authenticated Willys session (auth cookies)  |
| `data/preferences/` | —       | Placeholder for the food-preferences milestone      |

## Status

Done: the 4-tab web UI, streaming chat, the Willys client and agent tools, the
recipe database, ingredient aggregation, and week-keyed plans.

Not yet built: food-preference documents (`data/preferences/`) that would be
folded into the system prompt each week. The recipe database also only covers
the "Kalorisnål" category. Hemköp support is a plausible next store — a working
Hemköp CLI already exists on the author's machine and could be wrapped the same
way Willys is.

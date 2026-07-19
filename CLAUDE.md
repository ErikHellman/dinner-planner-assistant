# Dinner Planner Assistant

Single-user fullstack web app for planning weekly dinners with an LLM agent.
The long-term goal (recipe database, ingredient aggregation, grocery-store
cart tools as agent skills) is described in
`Project plan and description - Dinner planner assistant.md`. The app is a
4-tab Swedish-language web UI — Planera (streaming chat), Varukorg (live
Willys cart with quantity editing), Veckans recept (read-only week-keyed
plans), Alla recept (recipe browser) — with the Pi agent harness
(https://pi.dev) as the LLM integration.

## Stack

- SvelteKit 2 + Svelte 5 (runes), TypeScript, adapter-node — no separate
  backend; API routes live in `src/routes/api/`
- Pi SDK: `@earendil-works/pi-coding-agent` (docs and runnable examples ship
  inside the package under `docs/` and `examples/sdk/`)
- Plain CSS: global custom properties in `src/app.css`, scoped styles in
  components. Responsive, mobile-first.
- Vitest for unit tests, eslint + prettier

## Node version

Use Node 24.9.0 (`.nvmrc`). The default nvm Node (22.14) is BELOW the Pi
SDK's requirement (>=22.19). Prefix commands with
`PATH="$HOME/.nvm/versions/node/v24.9.0/bin:$PATH"` or `nvm use`.

## Commands

- `npm run dev` — dev server on :5173 (also via `.claude/launch.json` "dev")
- `npm run check` / `npm run lint` / `npm test` — types, style, unit tests
- `npm run build` then `npm start` — production build + serve (loads `.env`)
- `npm run recipes -- <harvest|search|get|ingredients|aggregate …>` — recipe database CLI
  (use `npm run --silent recipes -- …` when piping JSON). `aggregate` takes
  `--servings N --week 2026-W30` and writes the week's plan doc. `npm run
test:recipes` runs the live site-contract tests (network).

## Configuration

`.env` (git-ignored, template in `.env.example`): `PI_PROVIDER`, `PI_MODEL`,
and the provider's API key (`<PROVIDER>_API_KEY`, e.g. `ANTHROPIC_API_KEY`).
Without a key the app boots and shows a banner; chat returns a clear error.
`WILLYS_USERNAME`/`WILLYS_PASSWORD` (Swedish personnummer or Willys Plus
number + password) are required for the Willys grocery tools; without them
the tools fail with a clear "credentials missing" error.

## Architecture

- `src/lib/server/agent/` — everything Pi. Deliberately isolated so it could
  be extracted into a standalone service later. `session.ts` holds a
  globalThis-cached session singleton (survives Vite HMR) and wires up the
  Willys, recipe and plan tools below. The agent runs with `noTools: 'builtin'`
  plus thirteen native `customTools` (no shell/file tools) and a per-session
  system prompt (`prompt.ts` `buildSystemPrompt()` — interpolates the Stockholm
  date and current/next ISO week); future dinner-planning tools/skills get
  registered here.
- `src/lib/server/agent/tools/willys.ts` — wraps `WillysClient` as native Pi
  tools (`willys_search`, `willys_product`, `willys_cart_view`,
  `willys_cart_add`, `willys_cart_remove`, `willys_cart_clear`). Checkout is
  intentionally not implemented — the agent can only search and manage the
  cart.
- `src/lib/server/willys/` — pure-HTTP client for the Willys (Axfood/Hybris)
  online grocery store. Login-gated: there is no anonymous mode, so every
  call requires `WILLYS_USERNAME`/`WILLYS_PASSWORD`. Handles credential
  encryption, product search with category enrichment, and cart management
  (view/set-quantity/remove/clear). `shared.ts` exposes the ONE
  globalThis-cached `WillysClient` used by both the agent tools and the cart
  REST routes (the session-cookie file has no lock — never construct a second
  instance on `data/willys/session.json`). Gotcha: weight-priced `_KG`
  products REPORT cart quantity in grams but the qty you SET counts pieces
  (see `src/lib/cart/weight.ts`). Also exposed as a CLI (`cli.ts`, see
  Commands) independent of the agent tools.
- `src/lib/server/recipes/` — Linas matkasse recipe database. `harvest.ts`
  scrapes the public "Kalorisnål" receptbank (Next.js `__NEXT_DATA__` payloads,
  no login) into `data/recipes/` (one JSON doc per recipe, 2 servings each,
  hero images under `images/`; committed to git). `query.ts` (`RecipeStore`)
  serves search/get/ingredients to both the CLI (`cli.ts`) and the agent tools.
  `aggregate.ts` builds the deterministic shopping list from selected recipes
  (volume units merge in ml, pantry staples split out, amounts scaled from the
  stored 2 servings); persistence lives in the plan store below.
- `src/lib/server/plans/` — week-keyed plan documents. `store.ts` (`PlanStore`)
  reads/writes `data/plans/<YYYY>-Www.json` (`WeeklyPlan` in
  `src/lib/plans/types.ts`: recipes + servings + shopping list + nullable
  `willysCart` snapshot); `views.ts` joins plan recipes against the database
  for display (`exists` fallback when a re-harvest removed a recipe). ISO week
  math lives in `src/lib/plans/week.ts` (shared client/server, Europe/Stockholm).
- `src/lib/server/agent/tools/recipes.ts` + `tools/plans.ts` — native Pi tools
  (`recipe_search`, `recipe_get`, `recipe_ingredients`, `recipe_aggregate` —
  writes the week's plan doc and resets its snapshot — plus `plan_record_cart`,
  `plan_get` and `plan_delete`). Harvesting is CLI-only, deliberately not an
  agent tool.
- `src/lib/server/agent/events.ts` — maps Pi events to the wire protocol.
  Gotcha: Pi does NOT reject `prompt()` on provider errors; failures arrive
  as `message_end` with `stopReason: "error"`.
- `src/lib/chat/` — wire types (`types.ts`), SSE parser (`sse.ts`), the
  runes-based `ChatStore` (`chat.svelte.ts`, incl. draft + Swedish
  tool-activity labels from `activity.ts`) and its module singleton
  (`store.svelte.ts`). All client stores are module singletons so state
  survives tab navigation (`$lib/cart/cart.svelte.ts`,
  `$lib/recipes/browse.svelte.ts`, `$lib/plans/plan-view.svelte.ts`).
- `src/routes/` — pages `/` (chat), `/varukorg`, `/veckans-recept`, `/recept`,
  `/recept/[id]`; tab bar in `+layout.svelte` (bottom nav on mobile, top bar
  on desktop). API: `api/chat` (POST `{message}` → SSE
  `text`/`tool`/`done`/`error`; `reset/`; `health/` incl. `willysConfigured`),
  `api/cart` (GET/DELETE + POST `items` with ABSOLUTE quantity),
  `api/recipes` (+ `[id]`, `[id]/image?size=` — serves `data/recipes/images/`
  with immutable caching), `api/plans` (+ `[week]`). Wire errors are
  `{error, code}`; Swedish user-facing text is mapped from `code` in
  `$lib/api/client.ts`.
- `data/sessions/` (git-ignored) — Pi session JSONL files; read these when
  debugging agent turns. `data/willys/session.json` (git-ignored) caches the
  app/agent's authenticated Willys session (auth cookies). `data/recipes/`
  holds the harvested recipe database (JSON docs + images) and, unlike
  `data/sessions/`/`data/willys/`, is tracked in git. `data/plans/`
  (git-ignored) holds one `<YYYY>-Www.json` plan per ISO week (a legacy
  `shopping-list.json` may linger; it is ignored). `data/preferences/` is
  still a placeholder for a future milestone. `.agents/skills/` contains
  the `recipes` and `shopping-list` skills (CLI workflows — the web agent
  does not load them).

## Willys grocery CLI

`npm run willys -- <search|product|cart …>` drives the same `WillysClient` as
the agent tools, e.g. `npm run willys -- search mjölk`,
`npm run willys -- cart list` or `npm run willys -- cart record --week
2026-W30` (snapshot the cart into the weekly plan). `npm run` prepends a banner line to stdout, so
when piping/parsing the JSON output use
`npm run --silent willys -- …`, or call the script directly:
`node --env-file=.env --import tsx src/lib/server/willys/cli.ts search mjölk`.
The CLI caches its own session at `~/.willys-cli-session.json` (separate from
the app's `data/willys/session.json`).

## Future milestones (not yet built)

The 4-tab web UI, week-keyed plans and ingredient aggregation are done;
remaining: food-preference documents (`data/preferences/`). The recipe
database only covers the kalorisnål category (~200 recipes); re-run
`npm run recipes -- harvest` to refresh it. A working Hemköp CLI also exists
on this machine (`~/.local/bin/hemkop`, Claude skill in
`~/.claude/skills/hemkop`) that could similarly be wrapped as a Pi skill if
Hemköp support is wanted alongside Willys.

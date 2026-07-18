# Dinner Planner Assistant

Single-user fullstack web app for planning weekly dinners with an LLM agent.
The long-term goal (recipe database, ingredient aggregation, grocery-store
cart tools as agent skills) is described in
`Project plan and description - Dinner planner assistant.md`. The current
milestone is a streaming chat interface that uses the Pi agent harness
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
  Willys tools below. The agent runs with `noTools: 'builtin'` plus the six
  Willys `customTools` (no shell/file tools) and a custom system prompt
  (`prompt.ts`); future dinner-planning tools/skills get registered here.
- `src/lib/server/agent/tools/willys.ts` — wraps `WillysClient` as native Pi
  tools (`willys_search`, `willys_product`, `willys_cart_view`,
  `willys_cart_add`, `willys_cart_remove`, `willys_cart_clear`). Checkout is
  intentionally not implemented — the agent can only search and manage the
  cart.
- `src/lib/server/willys/` — pure-HTTP client for the Willys (Axfood/Hybris)
  online grocery store. Login-gated: there is no anonymous mode, so every
  call requires `WILLYS_USERNAME`/`WILLYS_PASSWORD`. Handles credential
  encryption, product search with category enrichment, and cart management
  (view/add/remove/clear). Also exposed as a CLI (`cli.ts`, see Commands)
  independent of the agent tools.
- `src/lib/server/agent/events.ts` — maps Pi events to the wire protocol.
  Gotcha: Pi does NOT reject `prompt()` on provider errors; failures arrive
  as `message_end` with `stopReason: "error"`.
- `src/lib/chat/` — wire types (`types.ts`), SSE parser (`sse.ts`), and the
  runes-based `ChatStore` (`chat.svelte.ts`) shared by the UI.
- `src/routes/api/chat/+server.ts` — POST `{message}` → SSE stream of wire
  events (`text`/`tool`/`done`/`error`). `reset/` starts a fresh session;
  `health/` reports config without leaking secrets.
- `data/sessions/` (git-ignored) — Pi session JSONL files; read these when
  debugging agent turns. `data/willys/session.json` (git-ignored) caches the
  app/agent's authenticated Willys session (auth cookies). `data/recipes/`,
  `data/preferences/`, `.agents/skills/` are placeholders for future
  milestones.

## Willys grocery CLI

`npm run willys -- <search|product|cart …>` drives the same `WillysClient` as
the agent tools, e.g. `npm run willys -- search mjölk` or
`npm run willys -- cart list`. `npm run` prepends a banner line to stdout, so
when piping/parsing the JSON output use
`npm run --silent willys -- …`, or call the script directly:
`node --env-file=.env --import tsx src/lib/server/willys/cli.ts search mjölk`.
The CLI caches its own session at `~/.willys-cli-session.json` (separate from
the app's `data/willys/session.json`).

## Future milestones (not yet built)

Recipe database + query tools and ingredient aggregation are still to come.
Willys grocery search/cart is done (see Architecture above); a working
Hemköp CLI also exists on this machine (`~/.local/bin/hemkop`, Claude skill
in `~/.claude/skills/hemkop`) that could similarly be wrapped as a Pi skill
if Hemköp support is wanted alongside Willys.

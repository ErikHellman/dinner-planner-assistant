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

## Architecture

- `src/lib/server/agent/` — everything Pi. Deliberately isolated so it could
  be extracted into a standalone service later. `session.ts` holds a
  globalThis-cached session singleton (survives Vite HMR). The agent runs
  with **no tools** and a custom system prompt (`prompt.ts`) for now;
  future dinner-planning tools/skills get registered here.
- `src/lib/server/agent/events.ts` — maps Pi events to the wire protocol.
  Gotcha: Pi does NOT reject `prompt()` on provider errors; failures arrive
  as `message_end` with `stopReason: "error"`.
- `src/lib/chat/` — wire types (`types.ts`), SSE parser (`sse.ts`), and the
  runes-based `ChatStore` (`chat.svelte.ts`) shared by the UI.
- `src/routes/api/chat/+server.ts` — POST `{message}` → SSE stream of wire
  events (`text`/`tool`/`done`/`error`). `reset/` starts a fresh session;
  `health/` reports config without leaking secrets.
- `data/sessions/` (git-ignored) — Pi session JSONL files; read these when
  debugging agent turns. `data/recipes/`, `data/preferences/`,
  `.agents/skills/` are placeholders for future milestones.

## Future milestones (not yet built)

Recipe database + query tools, ingredient aggregation, grocery-store cart
integration — note that a working Hemköp CLI already exists on this machine
(`~/.local/bin/hemkop`, Claude skill in `~/.claude/skills/hemkop`) and should
be wrapped as a Pi skill rather than rebuilt.

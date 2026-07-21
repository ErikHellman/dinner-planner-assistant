# Dinner Planner Assistant

Single-user fullstack web app for planning weekly dinners with an LLM agent.
The long-term goal (recipe database, ingredient aggregation, grocery-store
cart tools as agent skills) is described in
`Project plan and description - Dinner planner assistant.md`. The app is a
5-tab Swedish-language web UI — Planera (streaming chat), Varukorg (live
Willys cart with quantity editing), Veckans recept (read-only week-keyed
plans), Alla recept (recipe browser), Inställningar (prompt, food
preferences, LLM provider, Willys login) — with the Pi agent harness
(https://pi.dev) as the LLM integration.

## Stack

- SvelteKit 2 + Svelte 5 (runes), TypeScript, adapter-node — no separate
  backend; API routes live in `src/routes/api/`
- Pi SDK: `@earendil-works/pi-coding-agent` (docs and runnable examples ship
  inside the package under `docs/` and `examples/sdk/`)
- Plain CSS: global custom properties in `src/app.css`, scoped styles in
  components. Responsive, mobile-first.
- `marked` + `dompurify` render the agent's markdown in the chat thread
- Vitest for unit tests, eslint + prettier. Two projects: `server` (node) and
  `client` (jsdom, for `*.dom.test.ts` — code that needs a DOM).

## Node version

Use Node 24.9.0 (`.nvmrc`). The default nvm Node (22.14) is BELOW the Pi
SDK's requirement (>=22.19). Prefix commands with
`PATH="$HOME/.nvm/versions/node/v24.9.0/bin:$PATH"` or `nvm use`.

## Commands

- `npm run dev` — dev server on :5173 (also via `.claude/launch.json` "dev")
- `npm run check` / `npm run lint` / `npm test` — types, style, unit tests
- `npm run build` then `npm start` — production build + serve (loads `.env`)
- `docker compose up -d --build` — production deployment (Dockerfile +
  docker-compose.yml; `./data` bind-mounted from the host, container runs
  `node build` directly since `.env` may be absent)
- `npm run recipes -- <harvest|search|get|ingredients|aggregate …>` — recipe database CLI
  (use `npm run --silent recipes -- …` when piping JSON). `aggregate` takes
  `--servings N --week 2026-W30` and writes the week's plan doc. `npm run
test:recipes` runs the live site-contract tests (network).

## Configuration

Two layers, settings first and `.env` as the fallback for every field —
`src/lib/server/settings/effective.ts` is the ONE place that decides this.

`data/settings.json` (git-ignored), written from the Inställningar tab: extra
system-prompt instructions, food preferences, dislikes/allergies, provider,
model, API key and Willys credentials. The two secrets are encrypted at rest
(AES-256-GCM, key auto-generated in `data/settings.key`, mode 0600) and never
reach the browser — the API reports only `apiKeySource`/`passwordSource`.

`.env` (git-ignored, template in `.env.example`): `PI_PROVIDER`, `PI_MODEL`,
the provider's API key (`<PROVIDER>_API_KEY`, e.g. `ANTHROPIC_API_KEY`), and
`WILLYS_USERNAME`/`WILLYS_PASSWORD` (Swedish personnummer or Willys Plus
number + password). Without an API key the app boots and shows a banner; chat
returns a clear error. Without Willys credentials the grocery tools fail with
a clear "credentials missing" error.

## Architecture

- `src/lib/server/agent/` — everything Pi. Deliberately isolated so it could
  be extracted into a standalone service later. `session.ts` holds a
  globalThis-cached session singleton (survives Vite HMR) and wires up the
  Willys, recipe and plan tools below. The agent runs with `noTools: 'builtin'`
  plus fifteen native `customTools` (no shell/file tools) and a per-session
  system prompt (`prompt.ts`: `coreSystemPrompt()` interpolates the Stockholm
  date and current/next ISO week, `buildSystemPrompt()` appends the saved food
  preferences, allergies, extra instructions and the judged-recipe lists from
  the verdict store — blank blocks are omitted); future dinner-planning
  tools/skills get registered here. Gotcha: verdicts are read at session init
  like everything else in the prompt, so a verdict set mid-chat only applies
  from the next "Ny chatt" — deliberate, since resetting the session on every
  thumbs-up would discard the conversation.
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
  `src/lib/plans/types.ts`: recipes + servings + `status` + shopping list +
  nullable `willysCart` snapshot). `status` is `'new' | 'ordered'` ("Ny" /
  "Beställd" in the UI only): new plans start `new`, the user toggles it from
  the Veckans recept tab via `PATCH /api/plans/[week]`, and re-aggregating a
  week resets it. Gotcha: `load()` maps a MISSING status to `ordered` — plan
  docs predating the field are backfilled that way, so never make the field
  optional-by-default elsewhere. No agent tool sets the status. `views.ts` joins plan recipes against the database
  for display (`exists` fallback when a re-harvest removed a recipe).
  `history.ts` (`buildPlanHistory`) summarizes the most recent weeks to
  weekId + status + servings + recipes for the `plan_history` tool, skipping
  corrupt files so one bad document cannot hide every other week. ISO week
  math lives in `src/lib/plans/week.ts` (shared client/server, Europe/Stockholm).
- Cart coverage: `willysCart.coverage` maps each cart `productId` to the
  shopping-list item names it was bought for — the ONE link between an
  ingredient and a product, since the two share no key and fuzzy matching
  would make the checklist lie in both directions. The agent supplies it via
  `plan_record_cart`; `src/lib/plans/coverage.ts` (`buildCoverageDiff`, pure
  and client-shared, so it must never import from `$lib/server`) turns it into
  matched/unmatched/extra for both `plan_cart_diff` and the Veckans recept
  tab. Gotcha: `hasCoverage: false` means UNKNOWN (no snapshot, or one written
  before the field existed and backfilled to `[]` by `load()`), never
  "nothing matched" — do not render it as an all-unmatched list. Coverage
  naming a product that has left the cart is stale and ignored.
- `src/lib/server/agent/tools/recipes.ts` + `tools/plans.ts` — native Pi tools
  (`recipe_search`, `recipe_get`, `recipe_ingredients`, `recipe_aggregate` —
  writes the week's plan doc and resets its snapshot — plus `plan_record_cart`,
  `plan_cart_diff`, `plan_get`, `plan_history` and `plan_delete`). Harvesting
  is CLI-only, deliberately not an agent tool. No agent tool reads or writes
  the recipe verdicts; they reach the agent only through the system prompt.
- `src/lib/server/verdicts/` — `VerdictStore` over `data/verdicts.json`: one
  binary verdict (`liked` / `vetoed`) per recipe, with the recipe name
  denormalized so `summary()` can build the prompt block without loading 200
  recipe docs. A missing file is an empty document; a corrupt one throws
  rather than silently starting over. Gotcha: `set`/`clear` are serialized
  through an internal promise chain — two quick clicks on different cards
  overlap, and an unserialized load-modify-save drops one. The client
  (`$lib/verdicts/verdicts.svelte.ts`) applies only the affected recipe's
  entry from each response for the same reason.
- `src/lib/server/settings/` — the writable configuration document.
  `store.ts` (`SettingsStore`) reads/writes `data/settings.json` atomically;
  `secrets.ts` does the AES-256-GCM at-rest encryption (`data/settings.key`,
  auto-generated, 0600); `effective.ts` resolves settings-over-`.env` for the
  LLM config and for a lazily-read env view of the Willys credentials;
  `shared.ts` owns the globalThis-cached snapshot that synchronous consumers
  read (primed by `src/hooks.server.ts` `init`); `view.ts` projects the
  document to the client WITHOUT the secret values. Gotcha: saving restarts the
  agent session (`resetAgent()`) because provider/model/key/prompt are baked in
  at session init, and a Willys credential change also calls
  `resetWillysClient()`, which deletes the cookie cache of the old account.
- `src/lib/server/agent/events.ts` — maps Pi events to the wire protocol.
  Gotcha: Pi does NOT reject `prompt()` on provider errors; failures arrive
  as `message_end` with `stopReason: "error"`.
- `src/lib/chat/` — wire types (`types.ts`), SSE parser (`sse.ts`), the
  runes-based `ChatStore` (`chat.svelte.ts`, incl. draft + Swedish
  tool-activity labels from `activity.ts`) and its module singleton
  (`store.svelte.ts`). `phase.ts` is the pure `idle → thinking → tool →
writing` state machine behind every "the agent is working" affordance
  (status row above the input, caret on the streaming message, disabled
  `Skicka`); the store owns `phase` and `busy`/`statusLabel` derive from it.
  `markdown.ts` renders assistant messages (marked + GFM, then DOMPurify —
  agent output is untrusted, so it is never inserted raw; user text and error
  copy stay literal). Browser-only: the DOMPurify link hook is installed on
  first call, NOT at module load, or SSR of `Message.svelte` 500s. All client stores are module singletons so state
  survives tab navigation (`$lib/cart/cart.svelte.ts`,
  `$lib/recipes/browse.svelte.ts`, `$lib/plans/plan-view.svelte.ts`,
  `$lib/settings/settings.svelte.ts`, `$lib/verdicts/verdicts.svelte.ts`).
  The settings form never holds a secret
  it did not just receive from the user: an empty secret field means "keep",
  and the explicit "Ta bort sparat värde" button is what sends `''`.
- `src/routes/` — pages `/` (chat), `/varukorg`, `/veckans-recept`, `/recept`,
  `/recept/[id]`, `/installningar`; tab bar in `+layout.svelte` (bottom nav on
  mobile, top bar on desktop). API: `api/chat` (POST `{message}` → SSE
  `text`/`tool`/`done`/`error`; `reset/`; `health/` incl. `willysConfigured`),
  `api/cart` (GET/DELETE + POST `items` with ABSOLUTE quantity),
  `api/recipes` (+ `[id]`, `[id]/image?size=` — serves `data/recipes/images/`
  with immutable caching), `api/plans` (+ `[week]`: GET the plan, PATCH
  `{status}`), `api/verdicts` (GET all; `[id]` PUT
  `{verdict: 'liked' | 'vetoed' | null}`, null clears),
  `api/settings` (GET + PUT a partial update; `models/` lists
  Pi's provider/model catalog for the dropdowns). Wire errors are
  `{error, code}`; Swedish user-facing text is mapped from `code` in
  `$lib/api/client.ts`.
- `data/sessions/` (git-ignored) — Pi session JSONL files; read these when
  debugging agent turns. `data/willys/session.json` (git-ignored) caches the
  app/agent's authenticated Willys session (auth cookies). `data/recipes/`
  holds the harvested recipe database (JSON docs + images) and, unlike
  `data/sessions/`/`data/willys/`, is tracked in git. `data/plans/`
  (git-ignored) holds one `<YYYY>-Www.json` plan per ISO week (a legacy
  `shopping-list.json` may linger; it is ignored). `data/settings.json` +
  `data/settings.key` (git-ignored) hold the Inställningar document and its
  encryption key; `data/verdicts.json` (git-ignored) holds the per-recipe
  verdicts; `data/preferences/` is a leftover placeholder — food
  preferences live in the settings document now. `.agents/skills/` contains
  the `recipes` and `shopping-list` skills (CLI workflows — the web agent
  does not load them).

## Willys grocery CLI

`npm run willys -- <search|product|cart …>` drives the same `WillysClient` as
the agent tools, e.g. `npm run willys -- search mjölk`,
`npm run willys -- cart list` or `npm run willys -- cart record --week
2026-W30` (snapshot the cart into the weekly plan — with empty coverage,
since only the agent knows which ingredient each product was bought for).
`npm run` prepends a banner line to stdout, so
when piping/parsing the JSON output use
`npm run --silent willys -- …`, or call the script directly:
`node --env-file=.env --import tsx src/lib/server/willys/cli.ts search mjölk`.
The CLI caches its own session at `~/.willys-cli-session.json` (separate from
the app's `data/willys/session.json`).

## Future milestones (not yet built)

The 5-tab web UI, week-keyed plans, ingredient aggregation, the settings /
food-preference document, plan history, cart coverage and recipe verdicts are
done. The recipe
database only covers the kalorisnål category (~200 recipes); re-run
`npm run recipes -- harvest` to refresh it. A working Hemköp CLI also exists
on this machine (`~/.local/bin/hemkop`, Claude skill in
`~/.claude/skills/hemkop`) that could similarly be wrapped as a Pi skill if
Hemköp support is wanted alongside Willys.

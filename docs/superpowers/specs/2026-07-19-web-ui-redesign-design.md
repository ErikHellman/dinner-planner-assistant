# Web UI Redesign: 4-Tab App — Design

**Date:** 2026-07-19
**Status:** Approved (plan-mode review with user; decisions below confirmed via AskUserQuestion)

## Goal

Turn the single-chat web app into a 4-tab Swedish-language app:

1. **Planera** (`/`) — the existing chat, state surviving tab switches
2. **Varukorg** (`/varukorg`) — live Willys cart: reload, per-line quantity
   +/−, remove line, clear cart, link to willys.se to complete the purchase
3. **Veckans recept** (`/veckans-recept`) — read-only weekly plan with week
   navigation; plans become week-keyed JSON documents
4. **Alla recept** (`/recept`, `/recept/[id]`) — lazy-loading card grid of all
   ~200 recipes with a full detail view

Fully responsive mobile-first. The user is color blind: color never carries
meaning alone (icons + text + lightness contrast, Okabe-Ito-inspired semantic
colors, WCAG AA in light and dark). Keep and extend the warm terracotta/cream
theme.

## Decisions (made with the user)

1. **Plan contents:** a weekly plan stores recipes + servings + the aggregated
   ingredient list **and** a snapshot of matched Willys products (recorded by a
   new `plan_record_cart` agent tool after the agent fills the cart) — enough
   to re-populate the cart (`productId`, `quantity`, `pickUnit` per line).
2. **Plan editing:** the weekly-plan tab is **read-only**; all plan changes go
   through the chat agent (single writer).
3. **Color vision:** design safe for **all** types of color blindness rather
   than one specific type.
4. **UI language:** **Swedish** for all chrome (tabs, buttons, empty states,
   banners); API error messages stay English with stable `code`s, translated
   client-side.

## Grounding facts (verified against the code)

- `WillysClient.setQuantity(productId, qty, pickUnit)` sets the **absolute**
  line quantity (`addToCart` is an alias; `removeFromCart` = qty 0; `clearCart`
  = DELETE `/axfood/rest/v1/cart`). UI steppers send `line.quantity ± 1` with
  the line's `pickUnit`. No checkout endpoints exist (intentional).
- Cart lines drop the product image in `normalizeCart`; the raw payload has it
  and product image URLs are absolute `https://assets.axfood.se/...` —
  one-line fix adds `imageUrl` to `NormalizedCartLine`.
- Recipe images (`data/recipes/images/<id>-{large,small}.jpg`, portrait 2:3,
  ~42 KB / ~255 KB) are outside `static/` and need a serving endpoint.
- `ChatStore` is constructed inside `Chat.svelte` and the input draft is local
  to `MessageInput.svelte` — both move into a shared module singleton so tab
  switches keep the conversation, the stream, and the draft.
- The agent's `WillysClient` is private to `agent/session.ts`; the cart REST
  routes must share **one** client instance (the session-cookie file has no
  lock; two instances race on `JSESSIONID` rotation).
- `--muted` (#8a8178 on #faf7f2) fails WCAG AA → darkened to #6b635a.
- 114 recipe docs contain undecoded HTML entities (`&deg;` etc.) — decoded at
  serve time; `NAMED_ENTITIES` gains `deg`, `egrave`, `acirc`, `ntilde`,
  `ndash`.
- `.agents/skills/` are not loaded by the web agent (`noSkills: true`); they
  document CLI workflows and are updated for consistency only.
- 2026-07-19 is ISO week 2026-W29; 2026 has 53 ISO weeks.

## Weekly plan model

One plan per ISO week (Europe/Stockholm, Monday start), stored as
`data/plans/<YYYY>-W<ww>.json` (e.g. `2026-W29.json`; dir stays git-ignored).

```ts
interface WeeklyPlan {
	version: 1;
	weekId: string; // "2026-W29", must match filename
	servings: number;
	recipes: { recipeId: number; name: string }[]; // input order, duplicates OK
	shoppingList: { items: ShoppingListItem[]; pantryStaples: ShoppingListItem[] };
	willysCart: WillysCartSnapshot | null; // null until plan_record_cart;
	generatedAt: string; //   reset to null on re-aggregate
	updatedAt: string;
}
interface WillysCartSnapshot {
	recordedAt: string;
	store: { id: string | null };
	itemCount: number;
	totalQuantity: number;
	lines: NormalizedCartLine[]; // incl. imageUrl
	subtotal: Money;
}
```

- New `src/lib/plans/week.ts` (shared, pure): `currentWeekId`, `parseWeekId`,
  `weeksInIsoYear`, `addWeeks`, `weekRange`, `compareWeekIds`. Stockholm
  calendar date via `Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm' })`,
  then the UTC Thursday algorithm.
- New `src/lib/server/plans/store.ts` `PlanStore`: `listWeeks` (filename
  filter `^\d{4}-W\d{2}\.json$` — the legacy `shopping-list.json` is simply
  ignored, no migration), `load` (null on absent, `PlanStoreError` on corrupt),
  `save` (atomic via existing `writeFileAtomic`), `setWillysSnapshot`.
- `saveShoppingList`/`defaultShoppingListPath` are **removed** from
  `aggregate.ts`; `buildShoppingList` is unchanged and plan persistence lives
  in `PlanStore` only.

## Agent changes

- `recipe_aggregate(recipeIds, servings?, week?)` — `week` defaults to the
  current week; builds the list, wraps it in a `WeeklyPlan`, saves that week's
  doc (overwrites; **resets `willysCart` to null**). Returns the plan.
- New `plan_record_cart(week?)` — loads the plan (error if missing), reads the
  live cart via the shared client (error if empty), stores the snapshot.
- New `plan_get(week?)` — `{weekId, plan | null, availableWeeks}`.
- `agent/session.ts` uses a new `getWillysClient()` globalThis singleton
  (`src/lib/server/willys/shared.ts`) shared with the cart REST routes.
- `prompt.ts` becomes `buildSystemPrompt()` interpolating today's date and the
  current/next week ids; workflow: aggregate once per week → fill cart from
  `items` (skip `pantryStaples`) → `plan_record_cart` → point the user at the
  tabs.
- CLI: `recipes aggregate <ids...> [--servings N] [--week 2026-W31]`; new
  `willys cart record [--week W]`. `.agents/skills/{shopping-list,recipes}`
  updated to match.

## HTTP API

Errors: `json({ error, code }, { status })` (existing pattern); Swedish
messages are mapped client-side from `code`.

| Method | Path                              | Response                              | Errors                  |
| ------ | --------------------------------- | ------------------------------------- | ----------------------- |
| GET    | /api/health                       | + `willysConfigured`                  | —                       |
| GET    | /api/recipes                      | compact list + `headline`,`imageSmall`| 500 recipes_unavailable |
| GET    | /api/recipes/[id]                 | full decoded doc + image URLs         | 400, 404                |
| GET    | /api/recipes/[id]/image?size=     | JPEG, `immutable` + `?v=harvestedAt`  | 400, 404                |
| GET    | /api/cart                         | NormalizedCart (+`imageUrl`)          | 503 willys_not_configured, 502 willys_error |
| POST   | /api/cart/items                   | `{productId, quantity≥0, pickUnit}` (absolute) → updated cart | 400, 503, 502 |
| DELETE | /api/cart                         | emptied cart                          | 503, 502                |
| GET    | /api/plans                        | `{weeks, currentWeek}`                | 500 plan_error          |
| GET    | /api/plans/[week]                 | `{plan, recipes: PlanRecipeView[]}` (server-side join; `exists` flag for recipes removed by re-harvest) | 400, 404, 500 |

The image endpoint validates `id` against `/^\d+$/` and `size` against
`{large, small}`, constructs the path (never joins raw input), and asserts the
resolved path stays inside `data/recipes/images/`.

## Frontend

- Tab bar in `+layout.svelte`: bottom nav on mobile (<768px, safe-area aware),
  top bar on desktop; active tab = `aria-current` + bold + 3 px indicator (not
  color alone). Icons are inline SVGs in a single `Icon.svelte` (no deps).
- Module singleton stores (single-user app; all data fetched client-side):
  `chat` (messages, status, draft, tool-activity label), `cart`, `browse`
  (cached list + filter), `planView` (selected week). Streaming continues on
  other tabs because the SSE loop lives in the store.
- Chat surfaces `tool` wire events (previously ignored) as Swedish activity
  labels in the thinking bubble.
- Browse: one `/api/recipes` fetch (~60 KB), CSS grid
  `repeat(auto-fill, minmax(160px, 1fr))`, native `loading="lazy"` thumbnails,
  client-side diacritic-insensitive filter. Detail page shows every doc field.
- Varukorg: thumbnail, name/brand/size, unit price, stepper (44 px targets),
  line total, remove; totals incl. pant/rabatt; inline-confirm clear; reload;
  external link "Slutför köpet på willys.se"; 503 → Swedish setup banner.
- Veckans recept: week switcher (‹ ›, "Vecka 29 · 13–19 juli 2026", "Denna
  vecka"), recipe cards (link to detail when the recipe still exists),
  shopping list with per-recipe origin chips + "Basvaror" section, Willys
  snapshot section, empty state pointing at Planera.

## Theming

Extend `src/app.css` (keep the 10 existing tokens except `--muted`):
`--surface-2`, `--success(-bg)` #00775a/#e4f3ec (Okabe bluish-green),
`--info(-bg)` #0067a1/#e7f1f8, `--warning-text/-bg` #7a5300/#fbf0d3,
`--focus` (3 px `:focus-visible` outline, blue — distinct from terracotta
under all CVD types), `--radius-sm`, `--shadow-1`, spacing scale
`--space-1..7`, type scale `--text-sm..2xl`, `--tabbar-h`. Dark-mode variants
for all. `--accent` on white (~4.4:1) is reserved for large/bold text and
filled buttons. Pulse animation gets a `prefers-reduced-motion` guard.

## Testing

Vitest server project (no component harness; UI verified in the browser):
week utils (TZ rollover, 53-week years, year boundaries), PlanStore
(round-trip, corrupt files, legacy-file filtering, atomicity), image path
guards (traversal), cart mutation validation + error→status mapping,
normalize additions (cart `imageUrl`, `&deg;`), `recipe_aggregate` week
behavior (writes `<week>.json`, resets snapshot), plan tools with a mocked
client.

## Out of scope

- Checkout (remains link-out only), plan editing in the UI, food-preference
  documents, recipe re-harvest UI, multi-user concerns.

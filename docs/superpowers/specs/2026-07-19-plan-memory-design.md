# Plan memory — history, cart coverage and recipe verdicts

Date: 2026-07-19

## Problem

Three gaps in an otherwise feature-complete app, all of them about the system
remembering what actually happened:

1. **No history.** Plan documents for past weeks exist on disk, but the agent
   can only read one week at a time (`plan_get`). Every planning session starts
   amnesic: nothing stops it proposing the same dish three weeks running, and
   it cannot answer "what have we been eating a lot of".
2. **No verification of the cart.** The agent fills the Willys cart ingredient
   by ingredient, then asserts the cart matches the shopping list. Nothing
   checks that claim, so the realistic failure — one ingredient silently never
   added — is invisible to both the agent and the user.
3. **No feedback loop.** Preferences can only be updated by hand-writing prose
   in Inställningar. A dish the user loved or never wants again leaves no trace.

## Goals

1. `plan_history` — a compact, token-cheap view of recent weeks for the agent.
2. A **deterministic** shopping-list ↔ cart diff, visible to both the agent
   (as a tool) and the user (in Veckans recept).
3. A per-recipe verdict (favourite / never again) set from the recipe pages and
   fed into the system prompt.

## Non-goals

- No history UI. Veckans recept already navigates weeks.
- No fuzzy or heuristic product matching (see decision below).
- No star ratings, notes or cooked-counts on verdicts. The verdict is binary.
- No change to `recipe_search` behaviour. Vetoed recipes are still searchable;
  the prompt tells the agent not to suggest them.

---

## Part 1 — `plan_history`

### Module

New `src/lib/server/plans/history.ts`:

```ts
export interface PlanSummary {
	weekId: string;
	status: PlanStatus;
	servings: number;
	recipes: { recipeId: number; name: string }[];
}

export async function buildPlanHistory(
	store: PlanStore,
	limit: number
): Promise<PlanSummary[]>;
```

`listWeeks()` already returns every week id chronologically. `buildPlanHistory`
takes the last `limit` of them and loads only those documents, returning them
**newest first**.

Shopping lists and cart snapshots are deliberately omitted — they are the bulk
of a plan document and `plan_get` already covers "I need the details of one
week".

A corrupt plan file is **skipped**, not propagated: one bad document must not
blind the agent to every other week. `PlanStoreError` from `load()` is caught
per week; any other error propagates.

Weeks in the future are included. A plan for next week is legitimate context,
and filtering by "now" would make the tool's output depend on the clock.

### Tool

`plan_history({ weeks?: number })` in `tools/plans.ts`. Default 8, clamped to
1–52 rather than rejected, so a nonsense value degrades instead of erroring.
Returns `{ weeks: PlanSummary[] }`.

### Prompt

`coreSystemPrompt()` gains the tool in the tool list and one line in the
weekly-planning workflow: check recent weeks before proposing dinners, and
avoid repeating a dish from the last few weeks unless the user asks for it.

---

## Part 2 — Cart coverage and diff

### Decision: the agent records the mapping

A shopping-list item is an ingredient name (`potatis`); a cart line is a
product (`Potatis Fast Sverige Klass 1`). There is no shared key. Two options
were considered:

- **Fuzzy text matching** — needs no cooperation and works retroactively, but
  is heuristic: `kycklingfilé` vs `Kycklingbröstfilé Kronfågel` will sometimes
  miss, and a checklist that lies in either direction is worse than none.
- **Agent-recorded coverage** (chosen) — the agent states which shopping-list
  items each product covers, and the diff becomes exact set arithmetic. This
  matches the project's founding principle that the verification tools are
  deterministic so the LLM cannot hallucinate a result.

If the agent omits coverage, items read as *unmatched* — a visible, safe
failure rather than a false "all good".

### Data

```ts
export interface CartCoverageEntry {
	productId: string;
	covers: string[]; // shopping-list item names
}
```

`WillysCartSnapshot` gains `coverage: CartCoverageEntry[]`. Snapshots recorded
before this feature have no field; `PlanStore.load()` normalizes a missing
`coverage` to `[]`, the same backfill shape already used for `status`. Unlike
`status`, an absent value here is not a semantic claim — an empty coverage
list means "unknown", and the UI says so instead of reporting everything as
missing.

### Diff

New `src/lib/plans/coverage.ts` — pure, shared client/server, **no imports
from `$lib/server`** (it runs in the browser):

```ts
export interface CoverageDiff {
	/** False when no coverage was recorded at all — "unknown", not "nothing matched". */
	hasCoverage: boolean;
	matched: { name: string; productIds: string[] }[];
	unmatched: string[];
	extra: NormalizedCartLine[];
}

export function buildCoverageDiff(plan: WeeklyPlan): CoverageDiff;
```

Rules:

- Names compare after `trim().toLowerCase()`. The agent copies them verbatim
  from the list it was handed, so exact-after-normalization is sufficient and
  keeps the function free of the server-only `foldText` helper.
- A coverage entry whose `productId` is **not** in the snapshot's lines is
  stale (the product was removed from the cart afterwards) and is ignored, so
  the items it claimed correctly fall back to `unmatched`.
- A coverage entry naming an item that is not in the shopping list is ignored.
- `unmatched` covers `shoppingList.items` only. Pantry staples are excluded —
  the user is not expected to buy salt.
- `extra` is cart lines referenced by no live coverage entry.
- `willysCart === null` yields `hasCoverage: false` and empty arrays.

### Tools

- `plan_record_cart` gains an optional `coverage` parameter of the same shape,
  which the agent fills in as it shops. Absent means `[]`.
- New `plan_cart_diff({ week? })` returns the diff so the agent can check its
  own work before telling the user the cart is ready.

### UI

`CartSnapshotSection.svelte` renders the diff: covered ingredients, an
unmatched list (the important one), and extras. When `hasCoverage` is false it
says the plan predates coverage recording rather than showing a scary
all-unmatched list. No API change — `GET /api/plans/[week]` already returns the
raw plan document and `coverage.ts` runs client-side.

---

## Part 3 — Recipe verdicts

### Storage

`data/verdicts.json`, git-ignored (it is user data, unlike the tracked
`data/recipes/`):

```json
{
	"version": 1,
	"verdicts": {
		"100575": { "verdict": "vetoed", "name": "Grillad fläskkotlett…", "updatedAt": "…" }
	}
}
```

`src/lib/server/verdicts/store.ts` — `VerdictStore` with `load()`, `set(id,
verdict, name)` and `clear(id)`, using the existing `writeFileAtomic`. The
recipe name is denormalized into the document so the prompt can list names
without loading 200 recipe files. A missing file loads as empty.

### API

- `GET /api/verdicts` → `{ verdicts: Record<string, VerdictEntry> }`
- `PUT /api/verdicts/[id]` with `{ verdict: 'liked' | 'vetoed' | null }` —
  null clears. The route resolves the recipe name from `RecipeStore`; an
  unknown recipe id is a 404.

### UI

Module-singleton client store `src/lib/verdicts/verdicts.svelte.ts`, loaded
once and mutated optimistically. Two toggle buttons on `RecipeDetail.svelte`
and `RecipeCard.svelte`.

**Colorblind-safe, as required for this project:** state is carried by icon
shape (filled vs outline star; crossed circle), a Swedish text label
("Favorit" / "Aldrig igen") and `aria-pressed`. Hue never carries meaning on
its own.

### Prompt

`buildSystemPrompt` gains a verdicts block, built from the stored names:

```
## Recipes the user has judged
Favoriter (prefer these): …
Aldrig igen (never suggest these): …
```

Favourites are a preference; vetoes are a hard constraint, worded like the
allergy block. Blank lists are omitted, so a user who never clicks anything
gets exactly the current prompt.

`session.ts` reads the verdict store at session init and passes the names into
`buildSystemPrompt`. **Known staleness:** a verdict set mid-conversation
applies from the next "Ny chatt". Resetting the agent session on every thumbs-up
would throw away the user's chat, which is a worse trade than a prompt that is
one session behind. Documented in CLAUDE.md.

---

## Testing

- `history.test.ts` — empty dir, fewer than limit, more than limit (newest
  first), corrupt file skipped, clamping.
- `coverage.test.ts` — no snapshot, no coverage recorded, full coverage, one
  unmatched, stale productId, one product covering several items, extras,
  pantry staples excluded, case/whitespace normalization.
- `store.test.ts` (plans) — a snapshot without `coverage` loads as `[]`.
- `verdicts/store.test.ts` — set, overwrite, clear, missing file, corrupt file.
- `prompt.test.ts` — verdict block present/omitted, veto worded as a hard
  constraint.

## Rollout

Three commits, one per part, each independently shippable.

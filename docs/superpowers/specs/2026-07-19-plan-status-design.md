# Weekly plan status — design

Date: 2026-07-19

## Problem

A weekly plan document has no notion of where it is in its lifecycle. Once
the agent has aggregated a shopping list and filled the Willys cart, nothing
records whether the groceries were actually ordered, so the Veckans recept tab
cannot tell a plan that is still being worked on from one that is done.

## Goals

1. A plan carries a status: new ("ny") or ordered ("beställd").
2. Plans created from now on start as "ny".
3. The user can mark a plan "beställd" from the Veckans recept tab, and can
   change it back.
4. Plans that already exist on disk count as "beställd".

## Non-goals

- No agent tool for setting the status. The user asked for the tab control
  only; the agent keeps its existing plan tools unchanged.
- No status filtering or badges in the week switcher.

## Design

### 1. Type

```ts
export type PlanStatus = 'new' | 'ordered';
```

`WeeklyPlan` gains `status: PlanStatus`. Identifiers stay English and the
Swedish wording ("Ny", "Beställd") lives only in the UI, matching how the rest
of the codebase separates the two.

### 2. Store

`src/lib/server/plans/store.ts`:

- `createWeeklyPlan()` stamps `status: 'new'`. Re-aggregating a week therefore
  resets the status, which is consistent with it already clearing
  `willysCart` — a re-aggregated week is a fresh plan.
- `load()` normalizes a **missing** status to `'ordered'`. This is the
  backfill: every plan written from now on carries the field explicitly, so an
  absent status can only mean a document written before this feature, and
  those are exactly the plans that should read as ordered.
- `isWeeklyPlanShape()` accepts legacy documents with no status, but rejects a
  status that is present and not one of the two valid values (a corrupt file
  should fail loudly rather than silently become "ordered").
- New `setStatus(weekId, status)`, mirroring `setWillysSnapshot`: load, fail if
  the week has no plan, save with the new status.
- `setWillysSnapshot()` preserves the status (it already spreads the plan).

### 3. API

`PATCH /api/plans/[week]` with body `{ status: PlanStatus }`, returning
`{ plan }`.

- PATCH because this is a partial update of an existing resource.
- Unknown/missing status → 400 `{error, code: 'bad_request'}`.
- Invalid week id → 400, no plan for the week → 404, matching the existing GET
  handler in the same file.

### 4. Client and UI

- `PlanViewStore.setStatus(status)` calls the endpoint and swaps in the
  returned plan. Guarded against overlapping requests the same way `load()` is.
- `PlanView.svelte` header: a status badge plus a toggle button
  ("Markera som beställd" / "Markera som ny").

### 5. Accessibility and colour blindness

The badge carries **text plus a distinct icon** (a check for beställd); hue is
decoration only and never the sole carrier of the state. The toggle button's
label states the action in words.

### 6. Existing data

`data/plans/2026-W30.json` is rewritten so it carries `"status": "ordered"`
explicitly instead of relying on the load-time fallback. The fallback stays in
place regardless, since `data/plans/` is git-ignored and other machines may
hold plan documents written before this change.

## Testing

- Store: new plans default to `new`; a legacy document with no status loads as
  `ordered`; a document with a bogus status is rejected; `setStatus` round
  trips and fails cleanly for a week with no plan; `setWillysSnapshot`
  preserves the status.
- API route: PATCH updates the status; bad status → 400; unknown week → 404.
- UI verified in the browser preview.

## Files touched

- `src/lib/plans/types.ts` — `PlanStatus`, `WeeklyPlan.status`
- `src/lib/server/plans/store.ts` (+ `store.test.ts`)
- `src/routes/api/plans/[week]/+server.ts` (+ route test)
- `src/lib/plans/plan-view.svelte.ts` — `setStatus`
- `src/lib/components/plan/PlanView.svelte` — badge + toggle
- `data/plans/2026-W30.json` — backfilled (git-ignored)

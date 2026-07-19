# Agent working indicator — design

Date: 2026-07-19

## Problem

The chat UI does not reliably tell the user that the agent is working and that
more output is coming.

- `MessageList` renders the pulsing "thinking" bubble **only** while the last
  assistant message is still empty. As soon as the first text delta arrives the
  bubble disappears. If the agent then calls a tool and keeps writing — the
  normal case for a planning turn — the UI looks finished while it is not.
- Tool activity (`chat.activity`) is therefore only visible before the first
  token of a turn. Mid-turn tool calls are invisible.
- The `Skicka` button is *replaced* by `Stopp` while streaming. Nothing in the
  UI shows a disabled send affordance, so the state reads as "a different
  screen" rather than "send is unavailable right now".
- The textarea stays enabled and `Enter` silently does nothing while busy.

## Goals

1. While the agent is working, that fact is visible at all times, in a fixed
   place, regardless of how far into the turn we are.
2. It is clear that more output is expected for the message being streamed.
3. `Skicka` is present but disabled until the agent is ready for a new prompt.
4. All state is legible without relying on color (the user is color blind).

## Non-goals

- No changes to the server, the wire protocol, or the Pi agent integration.
  Every state below is derived from wire events that already exist.
- No queueing of a second prompt while the agent is busy.

## Design

### 1. Phase state

`ChatStore.status` (`'idle' | 'streaming'`) is replaced by:

```ts
export type ChatPhase = 'idle' | 'thinking' | 'tool' | 'writing';
```

`busy` becomes `phase !== 'idle'`, so existing consumers (`Chat.svelte`,
`MessageInput`, `MessageList`) keep working unchanged where they only need
"is it busy".

Transitions, driven by wire events that already arrive:

| trigger                       | next phase | activity      |
| ----------------------------- | ---------- | ------------- |
| `send()` starts a turn        | `thinking` | `null`        |
| `text` delta                  | `writing`  | unchanged     |
| `tool` event, `phase: start`  | `tool`     | Swedish label |
| `tool` event, `phase: end`    | `thinking` | `null`        |
| stream ends / abort / failure | `idle`     | `null`        |

`tool` end returns to `thinking` rather than `writing` because after a tool
result the agent is deciding what to do next; more output is expected.

### 2. Pure transition module

The transition table and the label mapping live in a new pure module
`src/lib/chat/phase.ts`:

```ts
export function nextPhase(current: ChatPhase, event: PhaseEvent): ChatPhase;
export function phaseLabel(phase: ChatPhase, activity: string | null): string | null;
```

This matches the existing shape of `sse.ts` and `activity.ts` (pure, unit
tested) and keeps `chat.svelte.ts` — which is not covered by the vitest `node`
project in a testable way — free of branching logic.

Labels (Swedish):

- `thinking` → `Tänker…`
- `tool` → the existing `activityLabel(name)` value, e.g. `Söker recept…`
- `writing` → `Skriver…`
- `idle` → `null`

### 3. Persistent status row

New component `src/lib/components/ChatStatus.svelte`, rendered in
`Chat.svelte` between `MessageList` and `MessageInput`. Visible whenever
`chat.busy`.

- Pulsing dot + the phase label.
- `role="status"` with `aria-live="polite"` so screen readers hear phase
  changes without stealing focus.
- Pinned above the input rather than inside the scrollable thread, so it stays
  visible for the whole turn — including the case that is broken today (text
  already streaming, tool running).

### 4. In-message caret

`Message.svelte` gains a `streaming` prop. The last assistant message renders a
blinking caret (`▍`) after its content while the store is busy, making it
unambiguous that this specific message is unfinished.

The existing empty-message "thinking" bubble stays, but shows the phase label
instead of a bare `…`.

### 5. Input row

`MessageInput.svelte`:

- `Skicka` is always rendered. `disabled = busy || disabled || draft is empty`.
- `Stopp` is rendered **beside** `Skicka` while busy, not instead of it.
- The textarea stays editable while busy so the user can type ahead. `Enter`
  is a no-op while busy (`submit()` already guards on `busy`).

### 6. Accessibility and color blindness

Every state is carried by text plus motion. No state is signalled by hue
alone:

- The status row's meaning is in its label, not its dot color.
- Disabled `Skicka` is a real `disabled` attribute (so it reaches assistive
  tech) plus reduced opacity and `cursor: default`.
- Animations inherit the existing global `prefers-reduced-motion` override in
  `src/app.css`.

## Testing

- Unit tests for `phase.ts`: the full transition table, and `phaseLabel` for
  every phase including the tool-label passthrough.
- No component test harness exists in this repo (vitest has only the `node`
  project), so no component tests are added. The UI is verified manually in
  the browser preview against a live streaming turn that includes a tool call.

## Files touched

- `src/lib/chat/phase.ts` (new) + `phase.test.ts` (new)
- `src/lib/chat/chat.svelte.ts` — `status` → `phase`, use `nextPhase`
- `src/lib/components/ChatStatus.svelte` (new)
- `src/lib/components/Chat.svelte` — render the status row
- `src/lib/components/MessageInput.svelte` — disabled Skicka + Stopp
- `src/lib/components/MessageList.svelte` — phase label, caret on last message
- `src/lib/components/Message.svelte` — `streaming` prop / caret

# Settings tab (Inställningar) — design

Date: 2026-07-19

## Problem

Everything that configures the app lives in `.env` and in code: the LLM
provider/model and API key (`src/lib/server/agent/config.ts`), the Willys
credentials (`src/lib/server/willys/config.ts`) and the system prompt
(`src/lib/server/agent/prompt.ts`). Changing any of it means editing a file and
restarting the server. Food preferences do not exist at all — `data/preferences/`
is an empty placeholder and the system prompt says "Saved food preferences are
still coming later."

## Goals

1. A fifth tab, **Inställningar**, edits: system prompt (extra instructions),
   general food preferences, disliked food and allergies, LLM provider settings
   and Willys credentials.
2. A pre-defined system prompt describes what the agent does in this system and
   is visible (read-only) in the tab.
3. Food preferences and dislikes/allergies are injected into the agent's
   context on every session.
4. Secrets are never stored in plaintext and never leave the server.

## Non-goals

- No multi-user or per-profile settings. This is a single-user local app.
- No agent tool for reading or writing settings. Preferences reach the agent
  through the system prompt only.
- No structured allergen model. Free text is what the LLM consumes best; a tag
  model would only pay off if recipe search consumed it too.

## Design

### 1. Storage

One git-ignored `data/settings.json`, written atomically with the existing
`writeFileAtomic` helper. `.env` remains a **fallback**: a field the settings
file does not set resolves to its env var, so existing installs keep working
untouched.

```ts
interface Settings {
	version: 1;
	extraInstructions: string;
	foodPreferences: string;
	dislikesAllergies: string;
	llm: { provider: string | null; model: string | null; apiKey: string | null };
	willys: { username: string | null; password: string | null };
	updatedAt: string;
}
```

The two secret fields (`llm.apiKey`, `willys.password`) are stored encrypted.

### 2. Secrets at rest

`src/lib/server/settings/secrets.ts`: AES-256-GCM, key auto-generated on first
save into `data/settings.key` (32 raw bytes, mode 0600, git-ignored). Format is
`v1:base64(iv|authTag|ciphertext)`.

`src/lib/server/willys/crypto.ts` is deliberately **not** reused — it replicates
willys.se's client-side credential format and is not an at-rest scheme.

This protects against accidental leakage (backups, screenshots, a stray `cat`,
an accidental commit), not against an attacker who already reads the data
directory — the key sits next to the file. That is the right trade-off for a
single-user local app: the alternative (a passphrase in `.env`) makes the app
unrecoverable when the passphrase is lost.

### 3. Resolution

`src/lib/server/settings/effective.ts` is the single place where "settings value
→ env fallback" is decided.

- `effectiveAgentConfig()` backs `describeAgentConfig()` / `getAgentConfig()`.
- `effectiveWillysEnv()` returns an env-shaped record that `WillysSession`
  already accepts — it calls `loadWillysConfig(this.env)` lazily at auth time,
  so `willys/shared.ts` only swaps what it passes in.

A globalThis-cached snapshot keeps this synchronous for those callers;
`src/hooks.server.ts` `init` primes it before the first request.

### 4. Prompt

The prompt stays generated in code (fixed core, always correct about the tools
and workflow). `buildSystemPrompt(now, prefs)` appends only the non-empty blocks:

```
## Användarens matpreferenser
…
## Ogillar och allergier
…   (allergies stated as hard constraints)
## Extra instruktioner
…
```

`coreSystemPrompt()` returns the core without those blocks, for the read-only
preview in the tab.

### 5. Applying changes

Saving is explicit and confirmed ("Detta startar om chatten"). The server then:

- always calls `resetAgent()` — provider, model, key and prompt are all baked
  into the session at init;
- calls a new `resetWillysClient()` when the Willys credentials changed, which
  drops the cached client **and** deletes `data/willys/session.json`, because
  cached cookies belong to the previous account.

### 6. API

- `GET /api/settings` — settings **without** secret values; instead
  `apiKeySource: 'settings' | 'env' | 'none'` and the equivalent for the Willys
  password, plus `corePrompt` and the resolved provider/model.
- `PUT /api/settings` — partial update. A secret field that is absent is left
  unchanged, `''` clears it, a string sets it. Saves, restarts, returns the GET
  shape.
- `GET /api/settings/models` — provider/model catalog from
  `ModelRuntime.getProviders()/getModels()`; an empty list makes the UI fall
  back to free-text inputs.
- `GET /api/health` switches to the effective config so the "no API key" banner
  respects settings.

### 7. UI

`/installningar`, one page of sections in the style of
`src/lib/components/plan/`: Systemprompt (collapsed read-only core + extra
instructions), Matpreferenser, Ogillar och allergier, LLM-leverantör, Willys.
One save button; secret fields show "Sparad" / "Från .env" / "Saknas" as text
plus icon, never colour alone.

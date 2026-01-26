# Phase 3 Handoff — `ui-app` (text-only, persisted)

## Current Branch / Commits

- Branch: `phase3/ui-app`
- Latest commits (newest first):
  - `cc2adda` feat(ui-app): persisted multi-convo chat (text-only) with history, streaming, and error summary
  - `7972df1` feat(next): move OpenRouter live stream into next layer; normalize errors
  - `d3d96d7` feat(ui): add ui-app entry switch (keep ui-next default)
  - `518f843` feat(gates): tc14 live smoke supports prompt; persist dev OpenRouter key
  - `db6c7ed` chore(dev): pin Node + stable native deps; add UI guardrails gates

## What Works Now (Scope)

- `ui-app` is a new persisted chat surface (left conversation list, right transcript + composer).
- Text-only vertical slice:
  - Conversation list/create (SQLite via `dbBridge`)
  - Transcript hydration from DB
  - Send → SSE streaming → Abort
  - Multi-turn history is included in `messages[]` for each request
  - Streaming text is persisted incrementally via `message.appendDelta` with throttled flush + final flush
- Error handling (Chat Completions only):
  - HTTP non-2xx errors normalized (request-phase)
  - Mid-stream SSE error chunk normalized (generation-phase) and stream terminates immediately (no need to wait for `[DONE]`)
  - `ui-app` shows a 1-line actionable summary + “Copy details”

Non-goals kept intentionally out (for now):

- No tool calling loop in `ui-app`
- No reasoning controls/panels in `ui-app`
- No multimodal input in `ui-app`
- No context trimming policy (optional future)

## Key Files (Jump List)

- Entry switch (default remains `ui-next`): `src/App.vue`
- `ui-app` root: `src/ui-app/AppChatApp.vue`
- `ui-app` composer: `src/ui-app/components/ChatAppComposer.vue`
- `ui-app` left list: `src/ui-app/components/ConversationList.vue`
- Live stream (next layer): `src/next/live/openRouterLiveStream.ts`
- Context loader (DB → InternalMessage[]): `src/next/context/loadConversationContext.ts`
- Request message builder (multimodal-ready, tool loop aware): `src/next/context/buildMessages.ts`
- Error normalization (serializable envelope): `src/next/errors/normalizeOpenRouterError.ts`
- UI guardrails gates: `scripts/gates/tc17-ui-guardrails.mjs`, `scripts/gates/tc18-ui-isolation.mjs`
- Live smoke gate: `scripts/gates/tc14-ui-live-smoke.mjs`

## How To Run (UI)

- Run default (`ui-next` harness):
  - `npm run electron:dev`

- Run `ui-app`:
  - PowerShell:
    - `$env:VITE_STARVERSE_ENTRY='ui-app'; npm run electron:dev`

Optional (key injection):

- `ui-app` now reads OpenRouter `apiKey/baseUrl` from `electronStore` (Settings panel), not from env.
- To set via PowerShell:
  - `$env:VITE_STARVERSE_ENTRY='ui-app'; npm run electron:dev`
  - Then click the top-right **Settings** button (gear) and paste your `openRouterApiKey` / `openRouterBaseUrl`.

## Dev Note (Native deps)

- `better-sqlite3` is a native module; do not run `npm test` (Node rebuild) while Electron is open.
- If you see a NODE_MODULE_VERSION mismatch, run `npm run rebuild:electron` and relaunch with `npm run electron:dev`.

## How To Verify (Baseline)

- Full SSOT verification (requires clean tree):
  - `npm run verify:ssot`

Notes:

- `verify:ssot` includes `tc15` (git clean gate).
- `tc14` is optional and can prompt for key: `node scripts/gates/tc14-ui-live-smoke.mjs --prompt --model openrouter/auto`

## Safety Note (API Keys)

- Never paste real API keys into chat/logs/docs. If a key was pasted, revoke it in OpenRouter and rotate immediately.

## Suggested Next Steps (to restore “main app” quickly)

1) Switch default entry to `ui-app` (keep env override to fall back to `ui-next`)
2) Implement conversation management UX:
   - rename, delete, archive/restore (depending on available DB methods)
3) Implement a basic Settings UI for:
   - OpenRouter key/baseUrl (via `electronStore`)
   - provider.require_parameters toggle
4) Add persistence for run/message meta (needs a DB method like `message.updateMeta`):
   - generationId, model/provider, finishReason, normalizedError envelope (serializable)
5) Only after 1–4 are stable: reintroduce advanced capabilities (reasoning, tool calling, multimodal, branching)

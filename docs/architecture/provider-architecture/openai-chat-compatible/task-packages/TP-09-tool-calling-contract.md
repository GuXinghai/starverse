# TP-09 — Tool Calling Parse, Persistence and Replay Contract

Status: `complete`

Completion evidence: 10 focused request/wire/tool/DB/boundary files / 87 tests passed, with `tsc`, `vue-tsc`, network-egress gate and `git diff --check` green. No production send or executor exists.

## Goal

Close tool calling end to end at the headless/domain layer: request definitions, streaming delta merge, non-stream tool calls, persistence, reload and historical request reconstruction. First release is observe-only—Starverse parses, exposes safe observe-only view models, persists and reconstructs calls/results but does not execute tools automatically.

## Dependencies and prerequisite state

- TP-04, TP-07 and TP-08 complete.
- Route/choice identity, request tools and wire tool events are stable.
- No production compatible send.

## Current evidence

- Current reducer can merge tool deltas in memory: `src/next/state/reducers/messageHandlers.ts:102-112` and `stateUtils.ts:149-187`.
- Current transcript rehydrate initializes `toolCalls: []`: `src/ui-app/app/appChatApp.logic.ts:2337-2387`.
- Current Generic path drops tool deltas; it has been deleted by TP-01.

## Production files and deletion scope

Create compatible tool modules under `src/shared/provider/openai-chat-compatible/tools/` and repositories for `compatible_tool_calls`/`compatible_tool_results`.

Modify provider-neutral state events/reducers only where the contract remains valid for native providers. Update context builders to emit standard assistant tool calls and `role=tool` results from structured records.

Delete any compatibility-only tests asserting tool calls are ignored. Do not add an executor or provider-hosted tool bridge.

## Schema, config and data impact

- Implement TP-02 schema tables for tool calls/results.
- Persist raw arguments text incrementally and parsed JSON only when complete/valid.
- Store tool index, ID, function name, sequence range, finish state and parse error.
- Tool result messages reference the exact route/call and remain normal conversation messages.

## Core invariants

- Delta identity is `(route, choiceIndex, toolIndex)`; provider tool ID is data, not the sole key.
- ID/name/arguments fragments merge deterministically in arrival order.
- Multiple parallel calls remain separate.
- Malformed final arguments are persisted as text plus a visible parse diagnostic, never executed.
- `finish_reason=tool_calls` finalizes all observed calls or reports incomplete calls.
- Reload reconstructs exactly the same calls/order/status.
- Provides structured persisted calls/results for TP-15 retry/regenerate/edit-resend reconstruction; production historical orchestration does not read UI text.
- Reasoning/tool/content events preserve one monotonic sequence.
- No automatic execution occurs.

## Implementation steps

1. Define tool definition, tool choice, delta, aggregate and result domain types.
2. Implement per-choice/per-index append merger with duplicate/id/name conflict diagnostics.
3. Implement non-stream tool-call normalization through the same aggregate contract.
4. Add transactional/idempotent persistence and reload queries.
5. Extend context/message builder for assistant tool calls and tool result roles.
6. Add terminal validation for incomplete/malformed calls.
7. Expose observe-only safe view models and a clear “not executed” state.
8. Add historical reconstruction tests with optional reasoning replay scope inputs from future TP-11.

## Tests and gates

- Fragmented ID/name/UTF-8 arguments and all chunk boundaries.
- Multiple calls, parallel flag, duplicate indexes/IDs and out-of-order deltas.
- Valid/malformed/empty arguments and incomplete terminal.
- Non-stream equivalence.
- Persistence/reload/idempotency/duplicate terminal.
- Tool result message/context reconstruction.
- Retry/regenerate/edit resend repository tests.
- Explicit no-executor/source guard.
- `npm run rebuild:node` before DB tests.
- `npx tsc --noEmit --pretty false`
- `git diff --check`

## Acceptance criteria

- Given TP-08 tool events/fixtures, the headless compatible contract no longer silently discards tool responses.
- Calls and results survive reload and reproduce standard Chat Completions messages.
- Malformed calls are visible/diagnosable and cannot execute.
- Multiple choices/calls preserve independent identity and ordering.
- No production compatible network send exists.

## Prohibitions

- No automatic or user-code tool execution.
- No arguments concatenation across choices/indexes.
- No persistence only in message meta or rendered text.
- No silent malformed-argument repair.
- No reasoning replay assumption; TP-11 owns it.

## Suggested commit

`feat(provider): persist compatible tool call streams`

## Stable contract for the next package

TP-11–TP-15 receive structured, reloadable tool chains with stable sequence and route/choice identity, suitable for explicit reasoning replay policies and UI display.

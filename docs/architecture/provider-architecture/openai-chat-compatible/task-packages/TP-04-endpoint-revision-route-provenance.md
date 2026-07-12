# TP-04 — Endpoint Revision and Atomic Route Provenance

Status: `complete`

## Goal

Implement immutable endpoint/profile/credential version resolution and atomically persist complete route provenance before any future outbound request. Close crash-before-terminal, retry/regenerate/edit-resend and provider/profile edit semantics at the repository/domain level.

## Dependencies and prerequisite state

- TP-02 and TP-03 complete.
- Registry can resolve safe immutable endpoint revisions and main-only credential refs.
- No production send route exists.

## Current evidence

- Current selection carries endpoint/profile in memory but historical message meta persists only provider/model.
- Current replay rebuilds endpoint from current settings in `src/ui-app/app/appChatApp.logic.ts:7718-7797`.
- Current terminal metadata writes provider/model in `src/ui-app/app/appChatApp.logic.ts:9099-9119`, leaving crash-before-terminal risk.

## Production files and deletion scope

Add compatible route coordinator/repository contracts under `src/shared/provider/openai-chat-compatible/route/` and DB handlers.

Modify:

- conversation/message begin-turn transactions in `infra/db/repo/messageRepo.ts` and worker handlers.
- `src/next/message/messageClient.ts` and DB IPC contracts.
- context loaders only to expose complete compatible provenance records by reference.
- state/session types to carry route ID and choice index.

Do not reuse the current `{providerId, modelId}` message-meta object as compatible provenance. Remove compatible fallback branches; leave native provider metadata behavior independent.

## Schema, config and data impact

- Use `compatible_route_provenance` and `compatible_route_choices` from TP-02.
- Provenance requires protocol key, instance/model, endpoint revision, credential version ref, request/response profile versions, reasoning mapping version/mode and inline policy version.
- `prepared` provenance and assistant candidate rows are created in one transaction.
- Existing legacy rows are not upgraded; TP-16 handles targeted deletion.

## Core invariants

- No network request can start without committed provenance.
- Endpoint/profile/credential edits never mutate existing provenance.
- Each choice has stable message identity and choice index.
- State transitions are idempotent and monotonic.
- Retry/regenerate/edit resend never use current settings to reconstruct an old route.
- Missing/deleted credential produces an explicit blocked route, not fallback.
- Startup recovery marks incomplete routes `interrupted` without fabricating final content.

## Implementation steps

1. Implement route-resolution input from explicit provider instance/model selection.
2. Resolve and validate all immutable version references.
3. Add atomic `prepareCompatibleTurn` transaction for user message, route, initial choice and status.
4. Add deterministic additional-choice creation by `choice.index`.
5. Add idempotent transition and terminal APIs.
6. Add startup recovery for orphan `prepared/streaming` routes.
7. Implement historical route lookup used by future retry/regenerate/edit operations.
8. Add tombstoned-provider and deleted-credential availability outcomes.
9. Remove any compatible code that re-derives endpoint/profile from current configuration.

## Tests and gates

- DB transaction rollback and crash injection tests.
- Endpoint/Base URL/profile/credential edit pinning tests.
- Retry/regenerate/edit route lookup tests without network.
- Provider/credential delete and tombstone tests.
- Multi-choice identity and duplicate/missing index tests.
- Startup interrupted recovery and terminal idempotency tests.
- `npm run rebuild:node` before DB tests.
- `npx tsc --noEmit --pretty false`
- `npm run verify:ssot`
- `git diff --check`

## Acceptance criteria

- Provenance exists before a mocked transport factory can be invoked.
- Every required version ref round-trips after reload.
- Historical route resolution is independent of current settings.
- Crash/restart leaves a diagnosable interrupted route with no false completion.
- No production fetch/send path is enabled.

## Prohibitions

- No message-meta-only compatible provenance.
- No mutable endpoint/profile refs.
- No provider/model guessing or fallback.
- No old-chat migration.
- No network implementation.

## Suggested commit

`feat(provider): persist compatible route provenance before send`

## Stable contract for the next package

All later builders, parsers, persistence and UI can consume a committed route ID whose endpoint, credential and profile versions are immutable and replay-safe.

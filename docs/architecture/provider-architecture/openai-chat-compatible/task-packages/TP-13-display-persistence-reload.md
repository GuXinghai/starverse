# TP-13 — Display, Persistence and Reload Consistency

Status: `complete`

## Goal

Close the provider-neutral event-to-display-to-SQLite loop for content, reasoning, tool calls/results, usage, errors, raw extensions and immutable route provenance, including deterministic reload and terminal recovery.

## Dependencies and prerequisite state

- TP-02, TP-04 and TP-08 through TP-12 complete.
- Route snapshots, ordered choice events, tool objects, selected reasoning-source metadata and bounded raw-extension records are stable contracts.
- No production compatible send path is enabled.

## Production files and deletion scope

Retain only contract-compatible portions of:

- `src/next/state/` event vocabulary, reducers and scheduler;
- `infra/db/repo/messageRepo.ts` transactional append/display primitives;
- provider-neutral display-block helpers.

Replace compatible-specific persistence/reload projections in `src/ui-app/app/appChatApp.logic.ts` and add repositories for route snapshots, choices, tool objects, reasoning source/mapping data and raw extensions. Delete any assumption that reload may reconstruct these fields from current settings or set tool calls to an empty array.

## Schema, config and data impact

- Use only TP-02 fresh tables and foreign keys.
- Persist every choice as an independently addressable assistant candidate while retaining request/turn association.
- Persist ordered content blocks, reasoning blocks, tool calls/results, usage snapshots, terminal outcome, bounded raw extensions and conflict diagnostics.
- Terminal completion is one durable checkpoint: final message state and all required child rows succeed together or remain explicitly incomplete/recoverable.
- No secret, credential value, sensitive header value or unredacted query is persisted.

## Core invariants

- Streaming display state and reloaded state are structurally equivalent.
- Display assembly consumes provider-neutral events; it never reads third-party wire field names.
- The adapter/parser does not own UI display blocks.
- A selected reasoning source and mapping version are immutable per choice.
- Tool deltas merge into stable tool-call identities and reload without loss.
- Usage is scoped and labelled as provider-reported or locally derived; it is never silently fabricated.
- Persistence failure at terminal state is user-visible and cannot be swallowed as successful completion.
- Aborted and failed messages retain a coherent partial transcript plus explicit terminal outcome.

## Implementation steps

1. Define the durable event projection and terminal checkpoint contract for each choice.
2. Project ordered content/reasoning/tool events into stable display blocks without token-per-block churn.
3. Persist tool-call arguments incrementally and finalize parse status without discarding malformed partial data.
4. Persist reasoning source lock, mapping/profile versions, conflicts and inline segment identities.
5. Persist bounded raw-extension records and discovery references from TP-10.
6. Persist usage, finish reason, error envelope and abort/EOF state with explicit provenance.
7. Implement reload projection that reconstructs the same domain objects without consulting current provider settings.
8. Implement transactional terminal finalize and explicit retry/recovery behavior for interrupted flushes.
9. Remove compatible-path non-fatal persistence swallowing and empty-tool reload defaults.

## Tests and gates

- Event reducer and scheduler ordering tests for interleaved content/reasoning/tools.
- SQLite round trips for every durable object and all terminal outcomes.
- Streaming state versus reload structural-equivalence tests.
- Multi-choice persistence and selection tests.
- Tool delta, malformed arguments, result and reload tests.
- Reasoning source lock, conflict and stable block-ID reload tests.
- Raw-extension redaction/limit/retention tests.
- Terminal transaction failure, retry, abort, EOF and crash-recovery tests.
- Run `npm run rebuild:node` before DB-heavy Vitest.
- `npx tsc --noEmit --pretty false`
- focused Vitest for reducers and repositories.
- `git diff --check`

## Acceptance criteria

- A completed, failed or stopped compatible turn reloads with the same visible content, reasoning, tools, usage and status that the user saw while streaming.
- Every stored choice retains immutable route and mapping provenance.
- No required terminal persistence error is downgraded to success.
- Raw diagnostic data is bounded and redacted.
- No production compatible send or settings UI is enabled.

## Prohibitions

- No wire-field access in UI components.
- No provider adapter-owned display assembler.
- No rebuild from current endpoint/profile settings.
- No choice-0-only persistence.
- No reasoning replay into the next request unless the request contract explicitly owns a standard field.

## Suggested commit

`feat(chat): persist compatible stream state consistently`

## Stable contract for the next package

TP-14 receives a complete provider-neutral read/write application service for instances, revisions, catalog entries, profiles, diagnostics and durable message projections; UI components need no wire-protocol knowledge.

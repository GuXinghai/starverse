# TP-11 — Reasoning Profiles, Custom Mapping and Per-choice Source Lock

Status: `complete`

## Goal

Implement versioned response reasoning mappings, D15’s two modes, per-choice source selection/locking, conflicts, request/response separation and explicit future-message history replay policies for structured reasoning sources.

## Dependencies and prerequisite state

- TP-04, TP-07, TP-08 and TP-10 complete.
- Pinned response profile/mapping version available in route provenance.
- Tool chain identity from TP-09 available for replay-scope tests.
- Inline parser is not implemented until TP-12.

## Production files and deletion scope

Create under `src/shared/provider/openai-chat-compatible/reasoning/`:

- mapping validator/projector;
- source candidate selector;
- per-choice lock state machine;
- conflict classifier/deduper;
- structured reasoning event mapper;
- history replay projector.

Extend domain/persistence types to record mapping mode/version, locked/final source and conflicts. Do not reuse native provider reasoning policies as the compatible mapper.

## Schema, config and data impact

- Response profile references exactly one immutable `CompatibleReasoningMapping` version; empty rules mean no custom mapping and use the built-in chain.
- Mapping stores `mode`, independent stream/final path/mode/textPath contracts, semantic and replay policy.
- Route provenance pins mapping ID/version/mode.
- Per-choice selected source and bounded conflicts persist for diagnostics/reload.
- Default replay remains disabled/never.

## Core invariants

- Exactly two modes: `custom_preferred_with_builtin_fallback` and `custom_only`.
- No custom mapping means the complete built-in chain.
- Candidate priority while unselected: custom → reasoning → reasoning_content → thinking → inline (inline supplied by TP-12).
- First valid non-empty type-compatible candidate locks once per choice.
- Locked source never switches during stream or final reconciliation.
- `custom_only` skips all built-ins and inline for that response.
- Empty/null/no-match does not lock or permanently fail a valid mapping.
- Invalid mapping fails save/preflight/send; it never runtime-falls back.
- Equivalent candidates dedupe; different values diagnose and never concatenate.
- Request reasoning mapping remains separate.
- Replay uses pinned historical profile only when explicitly configured.

## Implementation steps

1. Implement mapping/mode/replay validation and version creation.
2. Implement valid/no-match/config-error classification.
3. Implement one selector state per `choiceIndex` with monotonic status.
4. Add built-in candidate normalization for `reasoning`, `reasoning_content`, `thinking`.
5. Implement D15 same-event priority and late-source conflicts.
6. Implement final snapshot same-source reconcile; empty final cannot clear stream text.
7. Persist selected source, mapping mode/version and bounded conflict summaries.
8. Implement history replay projector for disabled, assistant field/tags and never/tool-chain/all scopes.
9. Enforce tool-chain-only replay against TP-09 structured chain identity.
10. Add safe diagnostics projections for future UI.

## Tests and gates

- Every D15 unit case from Owner lines 2128–2146.
- Same/different values and all conflict kinds.
- Per-choice independent locks and multi-choice responses.
- Final mismatch/empty snapshot/no-switch tests.
- Invalid DSL/type/semantic fail-before-fetch tests.
- Request/response mapping isolation tests.
- Replay disabled default, tool-chain-only and all-assistant tests.
- Profile edit/route pin/reload tests; old message never reinterpreted.
- Repository persistence/idempotency tests.
- `npm run rebuild:node` before DB tests.
- `npx tsc --noEmit --pretty false`
- `git diff --check`

## Acceptance criteria

- Only two modes exist in types, persistence and tests.
- A choice cannot select or emit more than one reasoning source.
- Late custom/built-in/final sources never switch or merge.
- custom-only produces no built-in reasoning.
- Mapping mode/version/final source/conflicts survive reload and are diagnosable.
- Replay is off by default and never inferred.
- No production send or UI mode control exists yet.

## Prohibitions

- No builtin-first/custom-supplement mode.
- No simultaneous independent reasoning blocks.
- No dynamic source switching.
- No response→request inference.
- No provider/model hardcoding.
- No inline parser implementation in this package.

## Suggested commit

`feat(reasoning): lock compatible reasoning source per choice`

## Stable contract for the next package

TP-12 can supply inline candidates to an already frozen selector; TP-13 can persist/display one stable selected source without recomputing mode or priority.

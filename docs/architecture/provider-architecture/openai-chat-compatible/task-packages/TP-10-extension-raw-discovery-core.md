# TP-10 — Extension Extraction, Bounded Raw Retention and Discovery Core

Status: `complete`

## Goal

Implement the general OpenAI-compatible extension layer between wire parsing and semantic mappers, plus bounded/redacted raw extension persistence and observation-only unknown-field discovery. Reasoning is the first semantic consumer but the extractor is not reasoning-specific.

## Dependencies and prerequisite state

- TP-02, TP-04 and TP-08 complete.
- Ordered extension candidates include route, message, choice, source path and sequence.
- No UI or production send.

## Production files and deletion scope

Create under `src/shared/provider/openai-chat-compatible/extensions/`:

- `openAICompatibleExtensionExtractor.ts`
- restricted path DSL parser/evaluator shared with request mappings where safe;
- raw coalescer/redactor/limiter;
- discovery aggregator and confidence calculator;
- extension/domain event types.

Implement repositories for raw records and discovered fields. Do not call the layer Generic and do not create one adapter per extension field.

## Schema, config and data impact

- Use `compatible_raw_extension_records` and `compatible_discovered_fields`.
- Persist profile/version, choice, source path/field, sequence range, kind, semantic and redaction state.
- Bounded ephemeral diagnostics and durable limits follow Master Plan Section 18.
- Ignore/confirmed candidate state is versioned; confirming creates a future response-profile/mapping version through later UI.

## Core invariants

- Transport/framer has no extension semantic knowledge.
- Extractor preserves eligible known/unknown fields within limits.
- Semantic mappers consume profile-matched candidates; unknown fields remain diagnostics.
- Current response is never reinterpreted by discovery.
- No provider/model/URL-name heuristics.
- Raw data is redacted/coalesced before persistence and never rendered directly.
- Opaque/signature/encrypted-like values never become text.
- Overflow is explicit and bounded, not silent or unbounded.
- Path DSL forbids script, regex, functions, computed/prototype access.

## Implementation steps

1. Define extension candidate/event contracts independent of reasoning.
2. Implement safe path normalization and wildcard restrictions.
3. Extract built-in and unknown fields from stream/final envelopes without assigning unknown semantics.
4. Implement append/snapshot coalescing by route/choice/path/profile/sequence.
5. Implement structural secret redaction before size accounting and write.
6. Enforce per-event, pending, record-count, record-size and response-total limits.
7. Implement discovery aggregates: type stability, count, timing, stream/final pairing and candidate confidence.
8. Exclude known non-reasoning semantic families from reasoning candidacy.
9. Implement ignore/confirm state and ensure confirmation only affects future profile versions.
10. Make persistence failure/overflow visible to terminal integration instead of silently dropping data.

## Tests and gates

- Path DSL valid/invalid/prototype/wildcard/limit tests.
- Stream/final extraction and pairing tests.
- Append/snapshot coalescing and duplicate tests.
- Secret-like nested fields and arbitrary sensitive header-name redaction.
- Opaque/signature/encrypted handling and Markdown non-entry.
- Every numeric retention/overflow boundary.
- Discovery confidence/type/timing/non-semantic exclusions.
- Current-response non-reinterpretation and future-version confirmation.
- Repository reload/version/ignore/confirm tests.
- `npm run rebuild:node` before DB tests.
- `npx tsc --noEmit --pretty false`
- privacy scan and `git diff --check`.

## Acceptance criteria

- Extension extraction supports reasoning now and additional semantic mappers later without transport changes.
- Unknown eligible fields are diagnosable without automatic display/mapping.
- Raw storage is bounded, redacted, version-pinned and reloadable.
- Overflow/persistence failures cannot be mistaken for complete durable success.
- No UI/send route exists.

## Prohibitions

- No complete SSE chunk archive.
- No raw-to-Markdown path.
- No automatic unknown→reasoning conversion.
- No script/regex/JSONPath/user code.
- No provider-specific extractor copies or `generic` names.

## Suggested commit

`feat(provider): extract and retain compatible extensions safely`

## Stable contract for the next package

TP-11 receives validated built-in/custom candidates and bounded conflict/raw diagnostics; TP-14 receives discovery aggregates that cannot mutate current semantics.

The completed scope emits bounded extension and discovery contracts only. The extractor emits profile-pinned reasoning semantic candidates for TP-11; it does not select, lock, merge or display a reasoning source. No renderer UI or production send route exists.

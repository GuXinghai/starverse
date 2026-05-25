# DFC-32 Durable State and Browser Harness Owner Memo

Status: owner-level stop memo after DFC-31. No production code, DB schema, Send Plan behavior, UI behavior, conversion runtime, dependencies, external engines, browser Playwright harness, or legacy bridge are changed in DFC-32.

SSOT: `docs/file-pipeline/document-format-conversion/starverse_format_conversion_preview_v1_2.md` remains authoritative and was not modified.

## Objective

DFC-31 completed the last known narrow non-gated Phase 1 visibility gap by surfacing backend-sanitized selected-ref mismatch diagnostics in the attachment details UI.

The next meaningful work now crosses at least one owner-gated boundary:

- durable option-generation or job-state storage for pending, retry, failure, and cross-process idempotency; or
- new browser Playwright harness scaffolding for an end-to-end upload, option, preview, and send-gating smoke.

## Current Facts

- `conversationDraft.ensureDfcOptions` is the explicit backend-owned generation trigger for Phase 1 text-like options.
- `conversationDraft.getDfcOptions` remains the backend-owned sanitized read path for option DTOs.
- `conversationDraft.getDfcPreview` resolves preview from the persisted selected option and selected refs.
- Send Plan selected DFC refs fail closed through backend-owned option/DerivedAsset authority and do not route through legacy extension, MIME, preferred send mode, selected send mode, `native_file`, `hybrid`, or `unsupported` fallback.
- Draft attachments persist `selectedOptionId` and `selectedAssetRefs`; message attachments persist sent option/ref snapshots.
- Ready derived options require verified `file_derivatives` rows with DFC target metadata.
- Pending visibility is limited to existing `file_derivatives.status = 'pending'` rows.
- Failed explicit generation can surface sanitized failed options, but failure state is represented with existing metadata rather than durable `ConversionOption` rows.
- Concurrent explicit ensure calls are coalesced only in the current worker runtime. This is not a durable cross-process uniqueness guarantee.
- No `playwright.config.*` or `tests/playwright/**` harness was found in the current repository.

## Stop Triggers

Proceeding without owner approval would cross the project stop conditions:

- Durable option-generation state, durable retry state, durable job uniqueness, or a dedicated `ConversionOption` table is a DB/job-state schema design.
- Browser Playwright smoke requires new browser harness scaffolding rather than extending an existing harness.
- Any new conversion engine, dependency, sandbox, Office/PDF/HTML/PS/EPS runtime, or external process remains separately owner-gated.

## Options

### Option A: Approve durable DFC generation state first

Add a durable backend state model for option generation and retry semantics before expanding runtime families or browser smoke.

Possible scope:

- Define durable identities for DFC generation attempts by raw asset, target kind, converter identity, conversion settings hash, and DFC exposure mode.
- Persist pending, ready, failed, stale, retryable, and terminal failure state without exposing paths, storage refs, raw hashes, file body, command details, or temp locations.
- Keep `original_file` as a synthetic identity option backed by `raw_file`, not a generated row.
- Keep ready derived send/preview authority in verified `file_derivatives`.
- Decide whether state belongs in a dedicated table, additional `derivative_jobs` fields, or a narrow companion table.
- Add uniqueness/idempotency tests and no-silent-fallback tests.

Pros:

- Moves the system closer to production semantics for retry, pending visibility, and cross-process consistency.
- Removes the current runtime-local coalescing limitation.
- Gives the UI deterministic pending and failure state without renderer inference.

Cons:

- Requires DB/job-state design and migration approval.
- Increases repository and worker complexity.
- Still needs separate browser smoke approval later.

### Option B: Approve browser Playwright harness first

Create the missing browser harness and add one smoke around the existing stable Phase 1 DFC flow.

Possible scope:

- Add a minimal owner-approved browser harness location and config.
- Use existing app launch and fixture conventions where possible.
- Smoke only the current supported path: attach a Phase 1 text-like file, open details, ensure backend DFC options, select backend-owned option, preview selected source, and verify send gating state.
- Do not add new conversion engines, new file families, or broad UI redesign in the same round.

Pros:

- Establishes the final acceptance path for the user-visible system.
- Reduces risk before larger storage or runtime changes.
- Keeps production behavior unchanged if limited to test harness and smoke.

Cons:

- Requires new harness scaffolding approval.
- Does not solve durable pending/retry/job-state semantics.
- May require environment setup decisions that are orthogonal to DFC contract semantics.

### Option C: Continue only narrow non-gated hardening

Search for another small backend/UI coverage gap that stays inside the existing schema, IPC shape, runtime, and harness.

Pros:

- Avoids owner-gated changes.
- Keeps diffs small.

Cons:

- Recent DFC-22 through DFC-31 rounds have already covered the known non-gated gaps around null hash, verified derivative authority, failure, pending, mismatch visibility, Send Plan fail-closed behavior, rehydrate, and UI diagnostic visibility.
- It risks spending effort on diminishing test-only hardening while the remaining production gaps are now gated.

## Recommendation

Approve Option A as the next implementation direction if the priority is production readiness.

Rationale:

- Durable pending, retry, and idempotency semantics are core product behavior, not just test coverage.
- The SSOT treats `ConversionOption` status, retryability, and failed/pending visibility as first-class behavior.
- Browser smoke is important, but it will still observe the current runtime-local limitations unless durable state is addressed.

Recommended DFC-33 scope if Option A is approved:

- Produce a narrow durable-state design tied to existing `file_derivatives` and `derivative_jobs`.
- Prefer the smallest schema that can prove idempotent generation, retry state, and sanitized pending/failed option DTOs.
- Keep new runtime families, external engines, browser Playwright harness, broad UI, broad Send Plan rewrite, and legacy bridge out of scope.
- Run `npm run rebuild:node` before DB-heavy Vitest.
- Validate with migration/repo/worker/service/shared tests, `vue-tsc` only if renderer state changes, `git diff --check`, and privacy/log scans.

Recommended DFC-33 alternate scope if Option B is approved:

- Add only the minimal browser harness and one existing-flow DFC smoke.
- Do not add durable DB state, external engines, or new conversion families in the same round.
- Keep assertions focused on backend-owned option identity, selected preview/send source, no renderer-invented refs, and no silent fallback.

## Owner Approval Request

Owner approval is required before implementing either:

- Option A: durable DFC option-generation or job-state storage.
- Option B: new browser Playwright harness scaffolding.

Recommendation: approve Option A for the next production implementation round, then approve browser Playwright smoke after durable pending/retry semantics have a stable backend contract.

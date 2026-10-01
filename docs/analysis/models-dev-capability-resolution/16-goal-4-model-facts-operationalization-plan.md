# Goal 4 Model Facts Operationalization Plan

- **Lifecycle Status**: Goal 4 in progress; S1 implemented, S2 and S3 pending
- **Document Role**: durable plan and recovery ledger for presentation-only operationalization of Goal 3 Resolved Model Facts
- **Last updated**: 2026-10-01
- **Baseline**: `models-dev-capability-resolution` at `c40fc6e1`
- **Authority**: implementation sequencing only; Model Facts semantics remain controlled by items 06, 10, 12, 13 and 15
- **Controlling inputs**: Goal 4 owner brief (project thread), item 15 (Goal 3 closeout), current production code

## Goal

Make existing Goal 3 Resolved Model Facts understandable and actionable: what state a capability is in, why a value was selected, which sources supported / opposed / were overridden, whether a problem is unsupported, unknown, conflict, data gap or no source coverage, why a control is hidden, and what a source-priority tie means. Presentation only.

## Frozen boundaries

No change to: the three-source resolver, source authority, source priority semantics, materialization, `capabilityRevision`, execution authority, runtime authorization, or the canonical ontology. Missing and invalid stay diagnostics; no new runtime states. They are shown as data-gap conditions derived from existing resolved facts and diagnostics. Whether missing/invalid become distinct runtime states is deferred.

## Shared presentation vocabulary

Single mapping: `src/shared/model-facts/modelFactPresentation.ts` (pure, renderer-safe, imports no resolver code). S2 and S3 must reuse it and add no second interpretation layer.

| Presentation state | Derived from (existing facts only) |
| --- | --- |
| supported | `state: resolved` with a selected value other than `support: unsupported` |
| unsupported | `state: resolved` with `{kind: support, value: unsupported}` |
| conflict | `state: conflict` |
| data_gap | `state: unknown` and `diagnostics` (missing/invalid) non-empty |
| no_source_coverage | `state: unknown`, no diagnostics, and no published source row has an outcome for the path (caller supplies `coveredBySource`) |
| unknown | any other `state: unknown` |

Localized keys: `settings.modelsCapabilities.facts.*` (state, stateExplanation, selectionReason, completeness, sourceKind, diagnosticKind, assertionKind, filter, detail), zh-CN and en-US. Selection reasons and unrecognized values never render as raw enums.

## Slice status

| Slice | Status | Commit |
| --- | --- | --- |
| S1 Inspector explainability | implemented, awaiting coordinator acceptance | `37336f7` |
| S2 Capability-aware control explanations | pending | |
| S3 Source Priority operational UX | pending | |

### S1 — Inspector explainability

Delivered:

- Resolved-field "why" panel in `ModelFactsInspectorPanel.vue`: presentation state and explanation, selected value, localized selection reason, completeness, per-claim source / priority / explicit-or-derived / value for supporting, opposing and overridden claims, tied conflict candidates, and missing/invalid diagnostics with error code.
- Per-field state badge in the resolved list; filters: all, conflict, unknown / data gap, has diagnostics (resolver-state driven).
- Renderer-recomputed "values differ" removed; the Fields tab marks a path only when the resolver reported `conflict`. The `valuesDiffer` i18n key was deleted.
- `sourcePriorityConfigRevision` displayed when the snapshot carries it; stale source reason labelled; overview description no longer claims the view never shows a winner.
- No client-side winner computation: the panel only reads resolver output.

Acceptance evidence:

- `src/shared/model-facts/modelFactPresentation.test.ts` (mapping, filters, i18n completeness).
- `src/ui-app/components/ModelFactsInspectorPanel.test.ts` (conflict ties, winner/overridden provenance, data gap vs unsupported, no coverage, filters, no "values differ").
- `src/next/generation-v2/model-facts/modelFactPresentationInvariance.test.ts` (golden: resolved payload, `capabilityRevision` and `sourcePriorityConfigRevision` identical before and after presentation).
- Validation results are listed under "Validation actually run".

Notes / decisions:

- Coverage for `no_source_coverage` is source-row based (any source outcome for the path). A source with a record but no outcome for the path counts as not covering it.
- Fields tab and Evidence tab remain source-local and unchanged otherwise.

## Deferred findings (not Goal 4)

- Evidence tab still prints raw JSON; copy buttons / revision collapsing / panel virtualization (polish, class C).
- Flat resolved-field list is not grouped by capability area (polish, class C).
- Carrying missing/invalid through the runtime projection, and `missing` / `requires_confirmation` in `resolvedCapabilityV2.ts` that nothing in Goal 3 produces (owner decision, later).
- Gemini thinking budget/level provider-data vertical slice: preferred follow-up (provider evidence -> Provider Native canonical facts -> Goal 3 resolution -> Inspector -> thinking controls). Not started.
- Known pre-existing failures at the `315fd49d` checkpoint (7 stale expectations, 20 Windows/CRLF-only tests, 2 suites needing the Electron binary) are out of scope.

## Validation actually run

S1 (cloud, Node ABI target, `npm ci` then `npm run rebuild:node`):

- `vitest.ui.config.ts`: ModelFactsInspectorPanel + ModelsAndCapabilitiesSettingsPanel tests pass.
- `vitest.unit.config.ts`: model-facts presentation, invariance golden, `src/shared/i18n` pass (103 tests).
- `tsc --noEmit`, `vue-tsc --noEmit`: clean.
- `i18n:check`, `i18n:scan-hardcoded`, `gate:generation-v2-goal3-authority`, `gate:model-identity-purge`, `gate:generation-v2-zero-residual`, `gate:docs`, `git diff --check`: pass.
- Not run in S1: Vite build, Electron smoke (cloud has no display), full suite.

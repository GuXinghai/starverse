# Goal 4 Model Facts Operationalization Plan

- **Lifecycle Status**: Goal 4 in progress; S1 accepted, S2 implemented, S3 pending
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

Single mapping: `src/shared/model-facts/modelFactPresentation.ts` (pure, renderer-safe, imports no resolver code). S2 and S3 must reuse it and add no second interpretation layer. S2 added `modelFactControlPresentation` to the same file for controls (see S2).

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
| S1 Inspector explainability | accepted | `37336f7` |
| S2 Capability-aware control explanations | implemented, awaiting acceptance | `6870fd5`, `72af221` |
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

### S2 — Capability-aware control explanations

Baseline `6fd946c`. Read-only inventory: project file `goal4/s2-controls-inventory.md`.

Delivered:

- `RUNTIME_PROJECTION_RULES` moved unchanged into the dependency-free `src/next/generation-v2/capability/runtimeProjectionSourcePathsV1.ts`, imported by the runtime projection and by the renderer, so a control names its exact Model Facts paths without a second table. Pure move: `stateFor`, `domainFor`, evidence and `capabilityRevision` untouched.
- `modelFactControlPresentation` in the S1 mapping: the controls projection stays authoritative for supported, unsupported and conflict; only an unresolved control is refined to unknown / data gap / no source coverage by calling `modelFactPresentationState` on the control's own resolved source fields. A projected `missing` is shown as data gap. The returned path is the deciding resolver path (first unsupported selection, first conflict, first selected value, first path with diagnostics, else the primary path); controls with no Model Facts path return no path.
- `src/ui-app/app/modelFactControlExplanations.ts`: per-session explanations built after each capability refresh. Inspector fields are used only when `resolvedFacts.capabilityRevision` equals the projection's; otherwise projection-only states stand. A refresh failure is now `failed` with its error code and is shown as data gap, never as "checking". Nothing here feeds send-time gating.
- Generation params editor: params hidden by Model Facts are listed as compact unavailable rows under the existing advanced toggle (with a one-line count when collapsed), each with state, explanation and an Inspect action; unknown-state params stay editable with a "Not verified" marker (unknown enums falling back to free text included); controls with no Model Facts field say so and have no Inspector link; the empty state shows checking or the refresh failure.
- Session console: the collapsed OpenAI Responses and Gemini thinking messages gain the state-specific reason; generic effort no longer vanishes silently; the Gemini image model reasoning section is a compact unavailable row instead of being removed; image options with no verified ratios show the reason; image editor fallback lists are marked "Not verified".
- Composer: disabled reasoning / Google thinking chips and the image chip without ratios carry the reason in their title; the attachment image reason is localized and state-specific (boolean unchanged).
- Exact Inspector navigation: `openModelFactsInspector(subject, path)` threads `inspectorPath` through `SettingsPanel` and `ModelsAndCapabilitiesSettingsPanel` to `ModelFactsInspectorPanel.initialPath`, which opens the "why" panel only when that exact resolved path exists.
- New strings only under `settings.modelsCapabilities.facts.control.*` (zh-CN, en-US); state labels and explanations reuse the S1 keys.

Decisions:

- Unmapped controls (thinking level/budget, reasoning summary, attachments, minP, seed, stop and the others in the inventory) are presented as unknown with "no Model Facts field describes this control", not as no source coverage, which S1 defines per Model Facts path.
- Revision mismatch between Inspector snapshot and projection: projection-only states, Inspector link still offered for the primary path.
- The composer's Gemini image thinking chip keeps its existing removal; the console carries the explanation row for that case (no test or chip redesign).

Acceptance evidence:

- `src/shared/model-facts/modelFactControlPresentation.test.ts` (projection precedence, deciding path, unknown split, unmapped, i18n).
- `src/ui-app/app/modelFactControlExplanations.test.ts` (five states distinct, revision mismatch, refresh failure not checking).
- `src/ui-app/components/ModelFactControlExplanations.test.ts` (unsupported and conflict rows with exact Inspector paths, unknown / data gap / no source coverage markers, unknown enum unverified, refresh failure, unchanged editor without explanations, console reasons, image fallback marker, composer chip reason, exact Inspector path and no near-match).
- Golden `modelFactPresentationInvariance.test.ts` and the existing editor, console, composer and Inspector suites pass unchanged.

## Deferred findings (not Goal 4)

- Evidence tab still prints raw JSON; copy buttons / revision collapsing / panel virtualization (polish, class C).
- Flat resolved-field list is not grouped by capability area (polish, class C).
- Carrying missing/invalid through the runtime projection, and `missing` / `requires_confirmation` in `resolvedCapabilityV2.ts` that nothing in Goal 3 produces (owner decision, later).
- Gemini thinking budget/level provider-data vertical slice: preferred follow-up (provider evidence -> Provider Native canonical facts -> Goal 3 resolution -> Inspector -> thinking controls). Not started.
- S2 inventory: Goal 3 never gives `image.mode` or `web.types` an enum domain (support-valued sources), so image generation class and googleSearch / imageSearch stay unavailable for Goal 3-backed models; S2 explains this as "not listed" but changing it is runtime/data semantics (owner decision).
- S2 inventory: no Goal 3 source paths for thinking level / budget, reasoning summary, image output mode or attachments (part of the Gemini thinking vertical slice).
- `validationHint` and the image editor labels are hardcoded English (i18n polish).
- Known pre-existing failures at the `315fd49d` checkpoint (7 stale expectations, 20 Windows/CRLF-only tests, 2 suites needing the Electron binary) are out of scope.

## Validation actually run

S1 (cloud, Node ABI target, `npm ci` then `npm run rebuild:node`):

- `vitest.ui.config.ts`: ModelFactsInspectorPanel + ModelsAndCapabilitiesSettingsPanel tests pass.
- `vitest.unit.config.ts`: model-facts presentation, invariance golden, `src/shared/i18n` pass (103 tests).
- `tsc --noEmit`, `vue-tsc --noEmit`: clean.
- `i18n:check`, `i18n:scan-hardcoded`, `gate:generation-v2-goal3-authority`, `gate:model-identity-purge`, `gate:generation-v2-zero-residual`, `gate:docs`, `git diff --check`: pass.
- Not run in S1: Vite build, Electron smoke (cloud has no display), full suite.

S2 (cloud, Node ABI target, `npm ci` then `npm run rebuild:node`):

- `vitest.ui.config.ts`: S2 control tests, explanations unit tests, ModelFactsInspectorPanel, ModelsAndCapabilitiesSettingsPanel, SettingsPanel, GenerationParamsSettingsEditor, ChatSessionConsole, ChatAppComposer and ComposerCapabilityChip suites pass (18 files, 151 tests).
- `vitest.unit.config.ts`: model-facts presentation (S1 + S2), invariance golden, `src/shared/i18n`, `src/next/generation-v2/capability` pass (17 files, 181 tests).
- `tsc --noEmit`, `vue-tsc --noEmit`: clean.
- `i18n:check`, `i18n:scan-hardcoded` (46 findings, same as baseline, none in S2 files), `gate:generation-v2-goal3-authority`, `gate:model-identity-purge`, `gate:generation-v2-zero-residual`, `gate:docs`, `git diff --check`: pass.
- Not run in S2: Vite build, Electron smoke (cloud has no display), full suite.

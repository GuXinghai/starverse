# Architecture residue, tests, and documentation audit

Audit date: 2026-10-03 (Asia/Tokyo). Source baseline supplied by coordinator: `models-dev-capability-resolution`, HEAD `8d928d6d`.

## Scope and evidence boundary

- Read-only application audit; only this report is authored. No production, dependency, native ABI, DB, settings, release, provider, or runtime changes.
- Static source inspection covers current tests, Electron smoke routes, architecture gates, and Goal 4 acceptance language. A test file's existence is not a test PASS, and a historical smoke PASS does not establish present full-product closure.
- Existing deliberate deferrals and internal-only APIs are not automatically classified as product gaps.
- Coordinator's already-found gaps are cross-checked for coverage instead of counted again.

## Documents checked

- `docs/analysis/models-dev-capability-resolution/16-goal-4-model-facts-operationalization-plan.md`
- `docs/analysis/models-dev-capability-resolution/README.md`
- `docs/maintenance/test-strategy.md`
- `docs/maintenance/maintainer-entry.md`
- `docs/governance/app-chat-app-logic-boundary.md`
- `docs/architecture/CURRENT_SYSTEM_ARCHITECTURE.md`
- Relevant acceptance entries in `docs/architecture/generation-compiler-v2/tp8-cutover-tests-goal3.md`.

## Retained findings

### AT-01 — HIGH / TEST_GAP: settings UI tests install retired authority and cannot detect the actual no-op

Risk language: P1 regression protection gap accompanying the already-reported settings closure defect; deduplicate the product defect with workstream 05/04.

User scenario: a user enables OpenRouter's require-parameters control, saves settings, and expects the next request to enforce the setting. Production resolves the retired `dbBridge` as absent and returns without a write. The UI test supplies that bridge, accepts the request, and asserts the call, so it validates a different authority surface from the shipped app.

Evidence:

- `src/next/settings/openRouterProviderSettingsClient.ts:11` checks `globalThis.dbBridge`; its setter returns early when missing (`:22-26`).
- `electron/preload.ts:14` exposes scoped `electronStore`, and `:217` exposes Generation V2 composer calls. The preload has no `dbBridge` exposure; the zero-residual gate explicitly prohibits it (`scripts/gates/generation-v2-zero-residual.mjs:53`).
- `src/ui-app/components/SettingsPanel.test.ts:199` creates a retired bridge whose `settings.setOpenRouterProviderRequireParameters` returns success (`:202`); `:335` installs it; `:552-553` asserts that retired call as success evidence.
- Store mocks accept arbitrary keys and writes (`SettingsPanel.test.ts:18-39`), whereas production store IPC requires exact allowed keys and returns `false` on rejected keys or oversized values (`electron/ipc/storeIpc.ts:70-72`, `:90-101`). This permissiveness is a coverage limitation, not evidence that every mocked root key is invalid.
- Existing store-handler tests test key rejection and size rejection (`electron/ipc/storeIpc.test.ts:199-231`) independently of the settings UI. The boundaries are each tested; the UI-to-current-authority closure is not.
- `tests/helpers/electronBridge.ts:18-26` also provides a raw `ipcRenderer`/`electron.ipc` test surface that real shell smoke asserts must be absent (`scripts/smoke/electron-shell-smoke.mjs:477`, `:487`). This is a fixture fidelity limitation, not a claim that the app exposes raw IPC.

Minimal repair direction: fix the product path under the settings finding, then add a narrowly scoped settings test using the actual exposed bridge shape and rejecting missing/unauthorized operations. Add one isolated Electron save/read-back or restart case for retained preferences. Avoid broad high-level request matrices already owned by provider/compiler tests.

Change scope: current bridge/backend wiring plus test fixtures and one focused acceptance journey. Existing tests: the mocked settings test does **not** catch the defect; store IPC tests cannot catch the missing UI caller; current generic Electron shell smoke does **not** exercise Settings. Runtime test results in this audit: NOT RUN.

### AT-02 — MEDIUM / DEAD_OR_LEGACY: active maintainer guardrails point to retired request authority

Risk language: P2 maintenance/documentation conflict; no current payload-bypass vulnerability established.

Contributor scenario: a maintainer follows the mandatory first-read document when implementing or repairing attachment sends. It says `openRouterSendPlanSerializer.ts` is the sole authorized request entry and `sendPlan.buildCurrent` is mandatory. That client requires the retired `dbBridge`; current product sends instead submit a Generation V2 command and compile in the main process. Following the active guardrail sends work toward an unreachable path and its unrelated tests.

Evidence:

- `docs/maintenance/maintainer-entry.md:3` is active; `:23`, `:60` name the old serializer as sole authority and `:63` mandates `sendPlan.buildCurrent`.
- `docs/governance/app-chat-app-logic-boundary.md:3-5` is an active SSOT; `:18`, `:33-35`, `:54`, `:61-64` retain the old preparation/client/serializer path and regression entries.
- `src/next/files/sendPlanClient.ts:63-74` requires `globalThis.dbBridge` and invokes `sendPlan.buildCurrent`. The old serializer exists at `src/next/openrouter/openRouterSendPlanSerializer.ts:171` but targeted production import search found no importer of it; the old preparation module has no external production caller in that search.
- Current UI sends use `submitGenerationV2Initial` (`src/ui-app/app/appChatApp.logic.ts:64`, `:6872`), which selects the scoped Generation V2 bridge (`src/next/generation-v2/renderer/generationV2CommandClient.ts:40`). The main-process `openRouterChatPlainTextInitialSendCoordinatorV2.ts:75` calls `compileOpenRouterChatPreparedRequestV2`; its compiler calls the V2 provider codec (`electron/services/openRouterChatPreparedRequestCompilerV2.ts:289`).
- This conflicts with `docs/architecture/CURRENT_SYSTEM_ARCHITECTURE.md:19`, `:38`, `:44`, which assigns current request authority to the main process and treats old dbBridge architecture as historical.

Minimal repair direction: replace only the obsolete mandatory authority names and regression destinations in the two active documents with the current command/compiler/attachment authority references; keep the app-layer containment rule. Mark old clients/serializer as historical or non-production only after checking remaining type/helper consumers. No general cleanup or production deletion is proposed here.

Change scope: docs only. Existing tests: runtime tests are not intended to detect narrative authority contradictions; static architecture gates validate specific tokens and paths, not these active-document claims.

## Coverage cross-check of coordinator findings

Statuses below describe inspected coverage, not freshly executed tests. Product findings are intentionally not counted again.

| Product loop | Current coverage and boundary | Would existing coverage detect the reported issue? |
| --- | --- | --- |
| Project deletion vs Inbox-preservation promise | `generationV2WorkspaceIpc.test.ts:103-130` tests quiesce + physical project deletion. `infra/db/v2/schemaComposerV2.test.ts:535-541` and `generationExecutionSchema.test.ts:496-529` explicitly endorse top-level physical cascade. | Backend tests affirm cascade; they do not compare the confirmation promise or assert preservation in Inbox. A UI-confirmation + persisted-conversation acceptance test is missing. |
| DOCX PDF option appears ready but selection searches HTML converter contract | `generationV2DfcService.test.ts:53-78` covers Markdown option availability only. App attachment tests mock Markdown option/select/preview (`AppChatApp.attachments.test.ts:136-145`). | Those tests and the generic shell smoke do not catch DOCX. **Specialized real-boundary coverage exists:** `scripts/dfc/office-pdf-libreoffice-packaged-electron-smoke.mjs:99-129` and `office-pdf-libreoffice-live-installed-state-smoke.mjs:405-425` call actual import → options → selection → preview and would catch it given current built code and a valid managed LibreOffice prerequisite. They were NOT RUN in this audit; do not label all DOCX coverage absent. |
| Retired settings/dbBridge controls | SettingsPanel fixture invents dbBridge (`:199`, `:335`); real store handler tests are separate. | No current UI-to-main closure test found; AT-01 consolidates this gap. |
| Cloud check failure appears indistinguishable from no update | `CapabilityRulesOverviewPanel.test.ts:7-31` supplies `check: vi.fn(async () => null)` and happy read state; remaining cases cover overrides, LKG, draft/save and rollback. `generationV2CloudCapabilityRulesIpc.test.ts:25` tests registered lifecycle/read projection. | Inspected panel cases do not assert failed-check persisted status becoming a visible error/retry state. This is a UI failure projection gap, not lack of Cloud service tests. |
| Source priority / Rule mutation does not invalidate active capability state | Source-priority panel tests call mocks (`ModelFactsSourcePrioritySettingsPanel.test.ts:12-14`); IPC test registers handlers over a real in-memory DB (`generationV2SourcePriorityConfigIpc.test.ts:9-29`). | These verify update/CAS and the panel separately, not mutation → app refresh → matching capability revision/explanations → next send. Shell smoke has no Facts/Rules/priority journey. |
| Draft text is flushed after active conversation changes | App send/attachment fixtures center on one `c1` (`AppChatApp.send.test.ts:369-400`, `AppChatApp.attachments.test.ts:82-111`). Composer client test covers immutable attachment projection (`generationV2ComposerClient.test.ts:5-35`). | No inspected case delays persistence while switching from typed conversation A to B and checks both persisted drafts. Generic shell smoke creates one seeded formal conversation and reloads it. |
| Unsupported web-search settings advertised to a provider | Provider request/compiler units and editor/component tests own separate behavior; generic shell smoke has no web-search send. | Do not infer UI-to-request closure from editor + codec tests; add a targeted case with the chosen native provider and the visible setting. Exact product defect belongs to the feature/model workstream. |
| Search result points outside latest loaded 50 turns | Search repository coverage exists (`infra/db/repo/generationV2SearchRepo.test.ts`); the generic Electron smoke never searches or targets a historical message. | Repository search success does not assert UI loading and focusing the returned historical message. Retain a targeted aged-history search journey with the product fix. |

## What the current Electron smoke actually proves

`scripts/smoke/electron-shell-smoke.mjs:470-490` checks that the renderer mounts, raw IPC is absent, and scoped preload globals exist. Its default DFC loop is backend-owned: real workspace/composer commands create/import/select/preview a Markdown fixture (`:44-109`), then reload, open attachment details, check Markdown text/preview, and close the dialog (`:501-529`). This is useful Electron + IPC + DB + renderer evidence.

It seeds file selection and DFC selection via test bridge before opening the details dialog; it does not click the DFC option as a user. It has no Settings save/restart, project deletion, Cloud check error, priority/Rule mutation, paid/provider send, rapid conversation switch, or historical-search navigation assertion. `SV_ELECTRON_SHELL_ONLY=1` exits even earlier after mount/preload checks (`:492-498`). Record the smoke mode with any PASS.

The `tests/e2e/` label is also not a browser/IPC guarantee: `streaming-smoke.test.ts:30-49` replays fixtures through a reducer; `image-block-ui-smoke.test.ts:21-38` replays a fixture and mounts `ChatTranscript` in jsdom. They validate the named projections, not the current app's full send authority.

## Current architecture gates

The four gate scripts were inspected first and run as pure read-only static checks. All passed at the confirmed HEAD `8d928d6d913d61e51052a8c52f2b665cac332c03`:

| Command | Result | Scope |
| --- | --- | --- |
| `node scripts/gates/generation-v2-zero-residual.mjs` | PASS; 11 runners, 20 deleted legacy paths | Named main/preload/app tokens, removed paths, prepared-body transport and separate raw-request DB. |
| `node scripts/gates/generation-v2-goal3-authority.mjs` | PASS; 908 production files | Removed overlay authority, fabricated-domain tokens, conflict preservation, final revision assertion, selected coordinator cutover strings. |
| `node scripts/gates/generation-v2-capability-rule-authority.mjs` | PASS; 398 production files | Named obsolete rule authorities/symbols and exact model literals outside approved sources. |
| `node scripts/gates/model-identity-compatibility-purge.mjs` | PASS; 908 production files, 12 deleted paths | Identity aliases/fallbacks plus explicit `nativeModelId` allowlist. |

Historical memory mentioned an identity-gate failure for `canonicalModelFactsV2.ts`; that is not current. The gate now explicitly permits exact Goal 3 subject identity in that file and related adapters/repositories (`model-identity-compatibility-purge.mjs:75-92`). No remaining runtime legacy-authority defect is inferred from that old failure.

These checks do not validate user action → persistence/refresh → next action. `package.json:77-80` keeps unit/UI/integration partitions separate; `verify:ssot` (`:109`) invokes unit tests plus listed gates, not the UI or integration partitions or Electron smoke. The partition choice is intentional and documented (`test-strategy.md:89-103`), not itself a defect. A PASS from one command should identify its scope.

## Documentation consistency verdict: WARN

Goal 4 documentation is appropriately bounded: the goal is presentation-only (`16-goal-4-model-facts-operationalization-plan.md:12-18`), owner freeze and semantic invariance remain explicit, deferrals are named (`:117-129`), and closed Goal 4 is not described as full project completion (`:158-180`). No source-authority/ontology or runtime-state changes are proposed by this report.

Its acceptance evidence is focused UI/pure presentation/DB-backed source-priority coverage, with full-suite non-green baseline classifications and limitations explicitly listed (`:170-178`). The historical `efc4ae5` record says local Electron validation was pending (`:177`). The user supplies a later local smoke PASS; preserve the historical record and, if updating the authoritative ledger later, append the later commit, command, date and smoke mode. Do not silently upgrade that shell PASS to Goal 4 feature-path or full-product acceptance.

Conflict retained: active maintenance authority guidance in AT-02. Goal 4's already-deferred raw enums, stale explanation display during a switch, unknown web/image domains, thinking-data acquisition and presentation polish are not relabeled as new implementation blockers here.

## Missing acceptance / non-goal language

- A small isolated production-preload acceptance set is needed for the concrete settings, mutation/refresh, draft-switch and destructive-confirmation findings. This is closure validation, not a demand to duplicate every compiler matrix in full App tests.
- DOCX acceptance should identify which specialized smoke was actually run against which build, with the managed LibreOffice prerequisite; generic Markdown shell smoke is insufficient.
- Keep P0/P1/P2 risk statements explicit. Static authority PASS, bounded phase closeout, presentation-goal acceptance, stabilization and full-product completion are separate claims.
- Retain owner-controlled non-goals: Goal 4 remains presentation-only; thinking-data/runtime-domain changes and broader file/runtime platform expansion require their own existing owner scope. Plugin/runtime architecture is not reopened by this testing audit.

## Suggested minimal documentation patch (not applied)

1. In `maintainer-entry.md`, replace the old mandatory serializer/preflight names with the current scoped Generation V2 command → main-process provider compiler authority; preserve path/key redaction and app-layer containment guidance.
2. In `app-chat-app-logic-boundary.md`, change only the obsolete send entry/migration/test pointers; retain planned-split/non-goal language.
3. If requested separately, append later local-smoke evidence to the Goal 4 ledger with precise mode and coverage, preserving the cloud record.

## Follow-up checks and audit validation

- Pair repairs with the existing code owner per product finding; do not open one broad cleanup package.
- First close actual high-impact destructive/draft/settings/DFC loops, then add only their targeted rejection/real-boundary regressions.
- Specialized DOCX smoke should be run only in authorized isolated state with prerequisites and the ABI sequence required by AGENTS.md; current audit did not install, build, rebuild or launch it.
- Production source, `.codex/config.toml`, `pelican-bicycle.html`, user profiles and DB state were not changed. Only this owned report was written. No commits/staging.
- Report whitespace check: `git diff --check --no-index -- NUL docs/analysis/product-gap-audit-20261002/08-architecture-tests.md` emitted no whitespace errors (exit 1 reflects a new-file diff; Git emitted only its LF/CRLF conversion warning).
- No ABI mismatch encountered during this static audit; no rebuild command run; existing ABI target not inspected or changed. No native artifacts committed.

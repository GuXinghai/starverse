# Starverse product-gap audit — coordinator summary

Requested output directory date: **2026-10-02**. Actual inspection: **2026-10-03, Asia/Tokyo**. Branch: `models-dev-capability-resolution`; HEAD: `8d928d6d913d61e51052a8c52f2b665cac332c03`, including `4ac2de5` and the later Goal 4 closeout.

## 1. Overall product closure assessment

**PARTIAL, with a BLOCKER in destructive consent.** The product has substantial implemented end-to-end infrastructure: scoped Generation V2 commands, durable graph/draft/asset authorities, streaming/retry safety, catalog/picker, source provenance and priority, Cloud/User Rules lifecycle, conversion runtimes, search indexing, and recovery. Current ordinary product journeys still have significant closure gaps.

The strongest problem is project deletion: confirmation promises to preserve chats in Inbox, but the reached backend physically cascades their deletion. Separate draft navigation/edit-scope errors can overwrite unsent content. These take priority over new acquisition features or broad cleanup.

**27 normalized retained findings: 1 BLOCKER, 11 HIGH, 15 MEDIUM, 0 LOW.** The top 20 are below; seven further retained findings cover reachability, usability and maintainability. These are a ranked shortlist, not a count of every string or dormant API. [findings.json](findings.json) is the final severity/type/deduplication authority; workstream reports contain candidate judgments and additional lower-priority observations.

### Evidence and scope

Eight independent subagent workstreams inspected current code and traced UI → state/client → scoped preload/IPC → service/repository where relevant. They ran in two overlapping waves because of the concurrency limit. Four read-only mapping agents supplied incremental report text for coordinator persistence; the main UI and three documentation-capable workstreams wrote their own reports. No report ownership was shared concurrently.

Coordinator cross-checks inspected the actual deletion/FK/default-project paths, reactive draft flush, search semantic generation/native contracts, priority refresh, persistence bridge, picker keyboard handler and sanitizer. Candidates were deduplicated and qualified against tests. In particular, specialized DOCX Electron smokes **do exist** and would catch its selection defect with valid prerequisites; the generic Markdown smoke does not.

Most retained findings are **static code-confirmed call/state mismatches**; no fresh Electron reproduction is claimed. The credential-redaction defect was independently reproduced against the current exported pure function using **dummy tokens**, without real credentials/network/native DB. This demonstrates a sanitizer defect, **not actual historical credential exposure**.

Cloud Rules v1.0.0 publication and prior Electron smoke PASS are user-supplied context. No remote publication was fetched and no new runtime smoke was run. Current bounded Goal 4 closeout is not reopened or equated with full-product completion.

## 2. Top 20 findings, ranked by severity and user impact

| Rank | ID | Severity | Type | Finding | Repair layer |
|---|---|---|---|---|---|
| 1 | SV-PGA-001 | BLOCKER | BROKEN_CLOSURE | Project deletion contradicts the promise to preserve conversations | BOTH |
| 2 | SV-PGA-002 | HIGH | STATE_PERSISTENCE | Conversation navigation can overwrite the destination draft | UI_ONLY |
| 3 | SV-PGA-003 | HIGH | STATE_PERSISTENCE | Edit session crosses conversations and is not restored after restart | BOTH |
| 4 | SV-PGA-004 | HIGH | SECURITY_PRIVACY | Credential sanitizer misses labels with URLs and provider header keys | BACKEND_ONLY |
| 5 | SV-PGA-005 | HIGH | STATE_PERSISTENCE | The newest project can become a false Inbox | BOTH |
| 6 | SV-PGA-006 | HIGH | BROKEN_CLOSURE | Web-search UI emits fields native contracts reject | UI_ONLY |
| 7 | SV-PGA-007 | HIGH | BROKEN_CLOSURE | Ready DOCX PDF cannot be selected | BACKEND_ONLY |
| 8 | SV-PGA-008 | HIGH | BROKEN_CLOSURE | Active conversation deletion leaves stale IDs and transcript | UI_ONLY |
| 9 | SV-PGA-009 | HIGH | STATE_PERSISTENCE | Rules/priority saves leave controls and Inspector stale | BOTH |
| 10 | SV-PGA-010 | HIGH | BROKEN_CLOSURE | Search hits outside current transcript cannot be located | BOTH |
| 11 | SV-PGA-011 | HIGH | ERROR_RECOVERY | Initial workspace failure hides the error and recovery entry | UI_ONLY |
| 12 | SV-PGA-012 | HIGH | ERROR_RECOVERY | Cloud check failures look like successful no updates | UI_ONLY |
| 13 | SV-PGA-013 | MEDIUM | I18N_A11Y | Enter on an action button invokes model selection | UI_ONLY |
| 14 | SV-PGA-014 | MEDIUM | STATE_PERSISTENCE | Provider catalog override reports Saved but is denied by IPC | BOTH |
| 15 | SV-PGA-015 | MEDIUM | STATE_PERSISTENCE | Preference persistence failure still reports success | BOTH |
| 16 | SV-PGA-016 | MEDIUM | DEAD_OR_LEGACY | Exposed legacy settings have no current runtime effect | UI_ONLY |
| 17 | SV-PGA-017 | MEDIUM | FEATURE_GAP | Generic User Rules cannot be authored in the GUI | UI_ONLY |
| 18 | SV-PGA-018 | MEDIUM | STATE_PERSISTENCE | Older async Inspector reads can overwrite newer selection | UI_ONLY |
| 19 | SV-PGA-019 | MEDIUM | BROKEN_CLOSURE | HTML/CSV format conversions send unchanged source | BACKEND_ONLY |
| 20 | SV-PGA-020 | MEDIUM | ERROR_RECOVERY | HTML PDF failure blocks independent original/text choices | BACKEND_ONLY |

The HIGH ranking emphasizes ordinary destructive/stateful or supported feature loops; it does not assert that all were live reproduced. The model-picker Enter bug is coordinator-ranked MEDIUM: it can persist an unintended visible model change, but no automatic provider request was established. The test-fixture gap is MEDIUM as cross-cutting evidence, avoiding duplicate HIGH impact already assigned to product defects.

### All BLOCKER/HIGH scenarios, loops, evidence and repair boundaries

### SV-PGA-001 — Project deletion contradicts the promise to preserve conversations

- Severity/type: **BLOCKER / BROKEN_CLOSURE**.
- User scenario: Delete a user project after confirming that its chats will move to Inbox.
- Broken loop: UI confirmation promises relocation; V2 IPC/repository directly deletes project; enforced FKs cascade through conversations/messages and generation records.
- Evidence: `src/ui-app/components/ConversationList.vue:703`; `src/shared/i18n/locales/en-US/navigation.json:9`; `infra/db/repo/conversationWorkspaceV2Repo.ts:31`; `infra/db/v2/coreConversationSchema.sql:11`; `electron/data-epoch/epoch2CommittedBootstrap.ts:118`; `infra/db/v2/schemaComposerV2.test.ts:535`.
- Minimal direction (BOTH): Close the current preservation contract with atomic relocation to the actual template-owning project before deletion, followed by refresh; if the owner chooses physical deletion, explicitly change consent/counts and test that product contract. This audit does not choose destructive semantics.
- Existing tests: **NO_PRODUCT_CONTRACT** — Schema tests intentionally cover physical cascade; IPC tests verify deletion/drain but never the preservation promise.
- Acceptance: Isolated DB+IPC project with chats/messages/drafts; assert preservation and actual Inbox ownership, then matching confirmation and active-scope refresh.

### SV-PGA-002 — Conversation navigation can overwrite the destination draft

- Severity/type: **HIGH / STATE_PERSISTENCE**.
- User scenario: Chat A has text and chat B a different saved draft; select B.
- Broken loop: Active ID changes before a synchronous watcher calls unscoped flush. Flush captures old visible text against new active scope/revision, writes B, then restores B.
- Evidence: `src/ui-app/app/appChatApp.logic.ts:1050`; `src/ui-app/app/appChatApp.logic.ts:2469`; `src/ui-app/app/appChatApp.logic.ts:4745`; `src/ui-app/app/appChatApp.logic.ts:4767`; `electron/ipc/generationV2ComposerIpc.ts:115`.
- Minimal direction (UI_ONLY): Capture immutable old scope/content and flush before navigation; guard restores by request/scope identity. CAS alone cannot prevent a correct-revision write to the wrong intended chat.
- Existing tests: **NO** — No two-conversation distinct-draft navigation assertion found in App fixtures.
- Acceptance: Hold IPC responses; navigate A→B→A with distinct drafts and attachments, verify both persisted texts and UI identities.

### SV-PGA-003 — Edit session crosses conversations and is not restored after restart

- Severity/type: **HIGH / STATE_PERSISTENCE**.
- User scenario: Edit A, navigate to B, then cancel/submit; reopen a persisted edit draft after restart.
- Broken loop: Global edit session survives navigation; submit uses old question in new branch, cancel assigns old previous draft into current chat; persisted edit mode restores without edit-session reconstruction.
- Evidence: `src/ui-app/app/appChatApp.logic.ts:765`; `src/ui-app/app/appChatApp.logic.ts:689`; `src/ui-app/app/appChatApp.logic.ts:2468`; `src/ui-app/app/appChatApp.logic.ts:7061`; `src/ui-app/app/appChatApp.logic.ts:4823`; `infra/db/repo/composerDraftV2Repo.ts:297`.
- Minimal direction (BOTH): Scope edit state and restore/cancel effects to conversation/branch, guard navigation/late responses, and rehydrate persisted edit semantics. Decide cancel-after-restart prior-snapshot contract explicitly.
- Existing tests: **NO** — Regenerate/retry and composer fixtures do not cover edit→navigate→cancel or restart with edit draft.
- Acceptance: Isolated A/B edit navigation/cancel and restart tests; no foreign draft assignment, correct edit controls/question identity.

### SV-PGA-004 — Credential sanitizer misses labels with URLs and provider header keys

- Severity/type: **HIGH / SECURITY_PRIVACY**.
- User scenario: A provider failure echoes a credential beside a safe URL or under x-api-key/x-goog-api-key; user opens/copies safe details.
- Broken loop: URL presence suppresses credential-label redaction; structured header names are omitted; matched values can survive persisted error facts and safe UI projections.
- Evidence: `src/shared/provider/providerFailureV2.ts:305`; `src/shared/provider/providerFailureV2.ts:356`; `electron/services/openAIResponsesStreamRunnerV2.ts:244`; `src/ui-app/components/ProviderFailureDetailsV2.vue:17`; `docs/analysis/product-gap-audit-20261002/synthetic-redaction-probe.json:1`.
- Minimal direction (BACKEND_ONLY): Run credential-label redaction independently of ordinary URL preservation; cover provider header names recursively and add composition cases. Preserve bounded useful nonsecret facts. No actual historical credential leak was established.
- Existing tests: **NO** — Existing Authorization/proxy/query tests miss label+safe URL and nested provider header keys; dummy probe confirms both holes.
- Acceptance: Pure-function regressions for label-only, label+URL, nested x-api-key/x-goog-api-key, safe URLs and authorization/query controls; persisted/details projection retains only redacted dummy values.

### SV-PGA-005 — The newest project can become a false Inbox

- Severity/type: **HIGH / STATE_PERSISTENCE**.
- User scenario: Create/rename another project, refresh projects or restart.
- Broken loop: ensure-default returns most recently updated project ID even when existing template belongs elsewhere; UI protection/Inbox and backend/new-chat destination diverge.
- Evidence: `electron/ipc/generationV2WorkspaceIpc.ts:87`; `infra/db/repo/systemChatTemplateV2Repo.ts:57`; `src/ui-app/app/appChatApp.logic.ts:2129`; `src/ui-app/components/ConversationList.vue:57`; `infra/db/repo/conversationWorkspaceV2Repo.ts:33`.
- Minimal direction (BOTH): Return the stored template's actual project ID and assert consistency with its conversation; consume that authoritative identity in UI.
- Existing tests: **NO** — Current UI fixtures supply a single stable default; no second-project ensure-default identity assertion found.
- Acceptance: Create/rename two projects in isolated state; defaultProjectId always equals stored template conversation project; New and delete protection agree.

### SV-PGA-006 — Web-search UI emits fields native contracts reject

- Severity/type: **HIGH / BROKEN_CLOSURE**.
- User scenario: Enable native web search on Anthropic or Gemini GenerateContent and send using ordinary settings.
- Broken loop: Universal search builder adds maxResults/context/optional engine; provider compiler rejects unsupported/unencoded fields although native search exists.
- Evidence: `src/ui-app/components/ChatSessionConsole.vue:2471`; `src/ui-app/app/appChatApp.logic.ts:6334`; `electron/services/anthropicGenerationAuthorityV2Service.ts:131`; `electron/services/geminiGenerateContentGenerationAuthorityV2Service.ts:185`; `src/next/generation-v2/capability/resolvedCapabilityV2.ts:377`.
- Minimal direction (UI_ONLY): Make controls/semantic emission provider-aware and omit unsupported fields. Preserve strict backend contracts rather than silently widening them.
- Existing tests: **NO_CLOSURE** — Editor and OpenRouter send-event mocks miss native UI→compiler/IPC closure; backend validation can reject without exposing the UI defect.
- Acceptance: Compile actual UI-built semantics through Anthropic/Gemini/Responses prepared compilers with synthetic capabilities and mocked transport; assert supported-only fields and no paid requests.

### SV-PGA-007 — Ready DOCX PDF cannot be selected

- Severity/type: **HIGH / BROKEN_CLOSURE**.
- User scenario: Managed LibreOffice successfully converts DOCX; choose its ready PDF option.
- Broken loop: Output is persisted under DOCX contract but every PDF selection queries HTML contract and raises OPTION_UNAVAILABLE.
- Evidence: `electron/services/generationV2DfcService.ts:123`; `electron/services/generationV2DfcService.ts:164`; `electron/services/generationV2DfcService.ts:79`; `scripts/dfc/office-pdf-libreoffice-packaged-electron-smoke.mjs:99`; `scripts/dfc/office-pdf-libreoffice-live-installed-state-smoke.mjs:405`.
- Minimal direction (BACKEND_ONLY): Bind the immutable output using the contract that produced the option; regression test generation→select→effective revision→send.
- Existing tests: **YES_SPECIALIZED_NOT_RUN** — Packaged/live-installed DOCX Electron smokes would catch selection failure with valid runtime/build prerequisites. Default shell Markdown smoke and service availability/adapter tests do not. No current specialized result claimed.
- Acceptance: Isolated DOCX service/IPC selection test plus the existing specialized temporary-profile smoke when its runtime prerequisites are available.

### SV-PGA-008 — Active conversation deletion leaves stale IDs and transcript

- Severity/type: **HIGH / BROKEN_CLOSURE**.
- User scenario: Delete the open chat, including through bulk deletion, then continue typing/sending.
- Broken loop: Backend deletion/list refresh succeeds; active IDs are not cleared; replacement selection happens only when ID is null; reload fails before replacing old transcript.
- Evidence: `src/ui-app/app/appChatApp.logic.ts:2565`; `src/ui-app/app/appChatApp.logic.ts:2592`; `src/ui-app/app/appChatApp.logic.ts:2103`; `src/ui-app/app/appChatApp.logic.ts:2217`.
- Minimal direction (UI_ONLY): After successful active deletion rebind/clear scope, transcript/cache and draft to a valid survivor or New template; coordinate with draft ownership repairs.
- Existing tests: **NO** — Repository/IPC deletion tests cover data mutations, not active renderer scope closure.
- Acceptance: Single/bulk active deletion with two chats: valid replacement IDs, no deleted transcript/send target, correct destination draft.

### SV-PGA-009 — Rules/priority saves leave controls and Inspector stale

- Severity/type: **HIGH / STATE_PERSISTENCE**.
- User scenario: Resolve a conflict in Rules/Source Priority and return to the unchanged active model/Inspector.
- Broken loop: Mutation updates local panel/config but emits no semantic invalidation; active capability watcher only tracks route/model/chat/image mode; Inspector persists old read. Stale-send safety fallback may refresh only after rejection.
- Evidence: `src/ui-app/components/ModelFactsSourcePrioritySettingsPanel.vue:107`; `src/ui-app/components/CapabilityRulesUserPanel.vue:266`; `src/ui-app/app/appChatApp.logic.ts:6805`; `electron/services/modelFactsInspectorV1Service.ts:124`; `src/ui-app/AppChatApp.send.test.ts:502`.
- Minimal direction (BOTH): Connect successful semantic mutations to authoritative current projection/re-resolution and Inspector refresh. Keep frozen retry snapshots and explicit resubmit guard.
- Existing tests: **PARTIAL** — Existing tests catch stale send and safely refresh without auto-resubmit; they do not catch proactive same-route controls/Inspector refresh after save.
- Acceptance: Save rule/priority with same model selected; refreshed winner/revision/control availability before send, Inspector reloads; retry remains frozen and no auto-send.

### SV-PGA-010 — Search hits outside current transcript cannot be located

- Severity/type: **HIGH / BROKEN_CLOSURE**.
- User scenario: Click a match older than latest 50 messages or on a different branch.
- Broken loop: Search closes, default/latest branch page loads, focus checks loaded messages only and returns false; caller ignores it; hit lacks branch identity.
- Evidence: `src/ui-app/components/SearchModal.vue:103`; `src/ui-app/app/appChatApp.logic.ts:2990`; `src/ui-app/app/appChatApp.logic.ts:2719`; `src/next/generation-v2/renderer/generationV2WorkspaceClient.ts:75`; `infra/db/repo/generationV2SearchRepo.ts:18`.
- Minimal direction (BOTH): Resolve eligible branch and load anchored/earlier pages before focus; report unavailable target with recovery. Reuse existing navigation helpers where correct.
- Existing tests: **NO** — Search repo indexing/query/rebuild tests pass without testing hit→branch/page→highlight closure.
- Acceptance: Search and open an older-than-50 hit and alternate-branch hit; target is visible/highlighted or a clear recoverable failure appears.

### SV-PGA-011 — Initial workspace failure hides the error and recovery entry

- Severity/type: **HIGH / ERROR_RECOVERY**.
- User scenario: First workspace/bootstrap IPC fails before active conversation assignment.
- Broken loop: Startup stores loadError; workspaceMode none hides sole error/settings topbar; list refresh with no projects does not retry full initialization.
- Evidence: `src/ui-app/app/appChatApp.logic.ts:7329`; `src/ui-app/app/appChatApp.logic.ts:7413`; `src/ui-app/app/appChatApp.logic.ts:3270`; `src/ui-app/AppChatApp.vue:458`.
- Minimal direction (UI_ONLY): Render root loading/error/retry and settings independently of active conversation; rerun bounded initialization rather than treating failure as empty workspace.
- Existing tests: **NO** — Current nominal startup fixtures and client error propagation tests do not render App under rejected initial reads.
- Acceptance: Reject first workspace read/missing bridge in isolated UI fixture; visible error and settings, retry successfully initializes without real profile.

### SV-PGA-012 — Cloud check failures look like successful no updates

- Severity/type: **HIGH / ERROR_RECOVERY**.
- User scenario: Click Check Updates offline, on server failure or invalid publication.
- Broken loop: Backend returns nonthrowing failed result; UI ignores it, reload clears error, persisted last failure/check metadata is omitted.
- Evidence: `src/ui-app/components/CapabilityRulesOverviewPanel.vue:102`; `electron/services/cloudRulesCandidateRefreshV1.ts:419`; `electron/ipc/generationV2CloudCapabilityRulesIpc.ts:102`; `infra/db/repo/cloudRulesDistributionV1Repo.ts:28`.
- Minimal direction (UI_ONLY): Handle result.ok and show localized failure/retry with last check and retained-good state; do not change real Cloud state during validation.
- Existing tests: **NO_UI_CLOSURE** — Backend tests deliberately cover nonthrowing failures; UI success-only mocks miss the discarded result.
- Acceptance: UI fixture returns failed check while prior release exists/no release exists; clear failure feedback, retained state and safe retry, no publication/apply.


### Further retained findings

| ID | Severity / type | Finding |
|---|---|---|
| SV-PGA-021 | MEDIUM / BACKEND_WITHOUT_UI | Branches can be selected but cannot be named or removed |
| SV-PGA-022 | MEDIUM / UI_GAP | Cloud rule semantics and before/after changes are hidden |
| SV-PGA-023 | MEDIUM / UI_WITHOUT_BACKEND | Enabled attachment send-mode action always rejects |
| SV-PGA-024 | MEDIUM / I18N_A11Y | Search/picker/attachment dialogs lack consistent focus and modal semantics |
| SV-PGA-025 | MEDIUM / I18N_A11Y | Search/manual-provider workflows ignore selected language |
| SV-PGA-026 | MEDIUM / TEST_GAP | Settings fixtures validate retired/permissive authority instead of production closure |
| SV-PGA-027 | MEDIUM / DEAD_OR_LEGACY | Active maintainer guardrails mandate retired send authority |

Their exact loops, repair layers and test assessments are in [findings.json](findings.json). Workstream reports additionally preserve partial-import failure disclosure, raw/PDF metadata notices, pack/bulk activation discoverability, keyboard favorite ordering, timeout/guidance and startup support-copy candidates. These were left below the primary normalized shortlist; unverified current release override mode and concurrency susceptibility are explicitly qualified.

## 3. UI gaps

- Branch name/fork/delete controls are absent despite durable backend clients (SV-PGA-021).
- User Rules GUI is restricted to single-model reasoning.support despite generic typed backend and JSON import (017).
- Cloud rule details omit the asserted value/target/selector/evidence, and candidate view lacks before/after comparison (022).
- Root workspace error/retry/settings are hidden before active conversation assignment (011).
- Enabled attachment send-mode action has no supported mutation behavior (023).
- Additional workstream candidates: Cloud pack/bulk activation controls and original/PDF metadata preview; do not infer an unverified current release pack mode.

## 4. Feature gaps and incomplete workflows

Native search, DOCX PDF selection, HTML/CSV semantic transforms and historical search navigation have implemented components but incomplete ordinary-user closure (006, 007, 019, 010). These are small corrective journeys rather than requests to broaden provider contracts, office format coverage, platforms, OCR or tool scope.

## 5. Backend/UI mismatch

Backend-only reachable-through-code capabilities include branch management, generic User assertions and Cloud pack overlays. Existing UI controls without useful current behavior include retired require_parameters/network experiments, attachment send mode, and provider catalog policies whose production store authority rejects their keys. Provider-specific web contracts are stricter than the universal UI builder.

## 6. Recovery, persistence and state synchronization

Highest priorities are project preservation, stable Inbox identity, old-scope draft writes, edit navigation/rehydration and active-delete replacement. Follow these with semantic mutation → current capability/Inspector invalidation, guarded Inspector async reads, honest save acknowledgments, root startup retry, Cloud check failure feedback and isolated PDF-option failures.

Supported precedence remains **global → project → conversation with atomic top-level-group replacement**; omitted groups inherit. Explicit disabled scope values persisting over later defaults is deliberate. Conversation CAS/update queue exists. Root `generationV2UiPreferences` is allowed; its ack handling differs from the separate denied provider dot-key path. General namespace RMW race was not promoted without exercised overlap.

Schema mismatch backup/reset is scoped, confirmed and fail-closed; broader startup failures do not authorize a reset. Preserve that boundary.

## 7. i18n, accessibility and interaction

Picker's ancestor Enter handling can execute selection while a native action button has focus (013). Search/picker/attachment dialogs lack a consistent focus/modal/background contract (024). Complete Search and manual compatible-provider workflows remain untranslated/mixed-language (025); scanner parity/threshold PASS does not establish usable localization. Keyboard favorite ordering is a documented secondary candidate. No live screen-reader/WCAG conformance claim is made.

## 8. Architecture and testing residue

Current four architecture/identity gates **PASS**. The historical nativeModelId allowlist failure is not current. Retired/permissive Settings fixtures validate unavailable dbBridge and unrestricted store behavior; focused tests using actual production preload/validation are needed (026). Active mandatory maintainer/SSOT documents still point to the retired serializer/sendPlan authority (027).

Existing generic Electron smoke is real preload/IPC/DB evidence, but backend-seeds one Markdown journey and checks shell/details. It does not exercise settings save/restart, project-preservation confirmation, rapid two-chat drafts, Rules mutation refresh, native search send or aged-history hit navigation. Specialized DOCX smokes cover a stronger DOCX boundary and were not run. Unit tests under an e2e directory can still be reducer/jsdom fixture tests; record actual execution boundary.

Coverage and acceptance evidence is mapped in [coverage-map.md](coverage-map.md), with `CLOSED` explicitly limited to inspected nominal scoped wiring.

## 9. Recommended small repair Goals

**Next Goal: G-A — Workspace data safety and scope ownership.** It closes ordinary destructive and draft-loss risks. Establish true template/Inbox identity before relocating chats; close deletion consent/active replacement in one bounded slice. Then close captured-scope draft writes and edit navigation/rehydration in another bounded slice. Acceptance uses isolated project/two-conversation state and current IPC, with no real-profile destructive test.

**Parallel urgent Goal: G-B — ProviderFailureV2 credential redaction.** Pure shared sanitizer repair plus synthetic regressions and safe persistence/detail projection. Keep actual-incident investigation separate: this audit found no proof of real exposure.

Subsequent immediate HIGH closure can proceed as independent Goals:

- **G-C1 — Native provider web-search mapping:** visible settings → supported semantic fields → strict native compiler.
- **G-C2 — DFC selection and independent failure recovery:** actual converter contract, correct existing text semantics, option-local failure; use the specialized DOCX smoke when prerequisites are available.
- **G-C3 — Workspace startup recovery surface:** visible root state, settings and bounded initialization retry.
- **G-D — Rules operational refresh and check feedback:** successful mutation invalidates current model/Inspector; failed check becomes visible; preserve no-auto-resubmit/frozen retry.

Product completeness should use separate reviewable batches: aged/branch search navigation; narrow catalog/prefs persistence authority and acknowledgments; typed User Rules; branch management; Cloud semantic read/change view. UX polish should separately close picker action-key behavior, shared dialogs and full localized workflows. Architecture/debt follows with the two narrow active-doc corrections and production-shaped settings acceptance fixtures.

Do not assign a new global roadmap number from this audit alone. Existing Goal 4/frozen capability, security and platform non-goals remain intact; these named audit Goals describe repair boundaries.

## Validation and preservation

| Check | Result / practical scope |
|---|---|
| `npm run i18n:check` | PASS, 0 warnings; dictionary namespace parity |
| `npm run i18n:scan-hardcoded` | PASS under threshold, 46 tolerated candidates; blanket exclusions remain |
| Four current architecture/identity scripts | PASS; named static authority/token/path checks |
| Current exported ProviderFailureV2 dummy probe | DEFECT REPRODUCED; label+URL and nested provider header holes |
| Vitest, DB/integration, Electron/UI smoke, real provider requests | NOT RUN; no current runtime or full-suite PASS claim |
| ABI | No native load/mismatch/rebuild; target unchanged and not inspected |
| Repository/profile boundary | Report files only; final comparison recorded in validation.json |

An initial esbuild probe setup found that package unavailable. The native Node TypeScript transform completed the same pure-function probe without installation. No production/settings/user DB/profile/Cloud Rules changes, credentials, paid requests, resets, publication, staging, commits or pushes were performed. Existing `.codex/config.toml` changes and `pelican-bicycle.html` are protected by baseline hashes and tracked-diff comparison.

## Report index

- [01 Main UI](01-main-ui.md)
- [02 Model / Provider / Capability](02-model-provider-capability.md)
- [03 Files / DFC](03-files-dfc.md)
- [04 Feature wiring](04-feature-wiring.md)
- [05 Settings / persistence](05-settings-persistence.md)
- [06 Errors / recovery / privacy](06-errors-recovery.md)
- [07 i18n / accessibility](07-i18n-a11y.md)
- [08 Architecture / tests](08-architecture-tests.md)
- [Normalized findings](findings.json)
- [Coverage map](coverage-map.md)
- [Baseline](baseline.json)
- [Synthetic redaction evidence](synthetic-redaction-probe.json)
- [Artifact/reference validation](artifact-validation.json)
- [Final preservation and check results](validation.json)

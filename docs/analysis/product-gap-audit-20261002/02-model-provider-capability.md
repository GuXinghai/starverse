# Workstream 02 — Model / Provider / Capability UX

Audit snapshot: `models-dev-capability-resolution` at `8d928d6d913d61e51052a8c52f2b665cac332c03`, inspected 2026-10-03 (Asia/Tokyo).

Status: complete. Final coordinator classifications are in findings.json; incremental checkpoints are preserved below. Production code and application state are read-only. A read-only mapping agent supplies incremental evidence; the coordinator persists this dedicated report because that agent's role forbids file writes.

Initial current-code map: `SettingsPanel.vue` → `ModelsAndCapabilitiesSettingsPanel.vue` → Inspector / Cloud Rules / User Rules; `preload.ts` → `generationV2ModelFactsInspectorIpc.ts` → `ModelFactsInspectorV1Service` and authoritative repositories. Source priority uses CAS-backed IPC. `ModelPickerDialog.vue` → catalog IPC → `ModelDetailPanel.vue` includes Inspector jump paths.

Goal 4 S3 source priority ordering, tie handling and conflict links are present and will not be reported as missing based on older documentation.

## Incremental evidence checkpoint

- Closed paths observed: Cloud check/candidate/apply/history/rollback/pin/resume and per-rule activation; User durable draft/import/export/save/cancel and first-pack creation; Inspector selected values, supporting/opposing/overridden claims, conflicts, diagnostics and raw evidence; Source Priority rank/tie/CAS recovery.
- Strong candidate: Cloud Check Updates discards a nonthrowing `{ok:false}` result, reloads and clears the UI error, making failed checks look like a successful unchanged release. Trace: `CapabilityRulesOverviewPanel.vue:102` → `generationV2CloudCapabilityRulesIpc.ts:102` → `cloudRulesCandidateRefreshV1.ts:419-428`. Distribution metadata records last failure/check times, but overview UI omits them. Existing backend tests cover nonthrowing failure; current overview UI tests mock success.
- Further candidates under verification: restricted User rule authoring, Cloud rule semantic details/change comparison, pack activation discoverability, asynchronous Inspector selection, and Inspector refresh after priority changes. These are not yet coordinator-retained findings.

## Completed workstream findings

The six candidates below were supplied incrementally by the read-only mapper and persisted by the coordinator. Severity is subject to the normalized coordinator findings.

| Candidate | Severity / type | Scenario and broken loop | Evidence | Minimal direction / tests |
|---|---|---|---|---|
| MC-01 | HIGH / ERROR_RECOVERY | Offline, HTTP or publication failure during Check Updates returns a failed result but the panel reloads into an unchanged/no-packs state without failure feedback. | `src/ui-app/components/CapabilityRulesOverviewPanel.vue:102`; `electron/services/cloudRulesCandidateRefreshV1.ts:419`; `electron/ipc/generationV2CloudCapabilityRulesIpc.ts:102`; `infra/db/repo/cloudRulesDistributionV1Repo.ts:28`. | UI: inspect result, show localized failure/retry and last check/LKG state. Backend tests cover nonthrowing failures; UI success-only mocks miss them. |
| MC-02 | HIGH / STATE_PERSISTENCE | Correct a conflict through Rules or Source Priority, save, return to the same Inspector/model. Panels reload locally, while controls and persisted Inspector remain stale. Next send may require the existing safe stale-revision refresh and a second explicit submission. | `ModelFactsSourcePrioritySettingsPanel.vue:107`; `CapabilityRulesUserPanel.vue:266`; `appChatApp.logic.ts:6805`, `:7436`; `electron/services/modelFactsInspectorV1Service.ts:124`; `sourcePriorityConfigV1Service.ts:19`. | Both: successful semantic mutation invalidates active projection and Inspector through authoritative resolution. Preserve frozen retries and no automatic resubmit. `AppChatApp.send.test.ts:502` tests the fallback, not proactive same-route refresh. |
| MC-03 | MEDIUM / FEATURE_GAP | GUI creates only single-model reasoning.support rules; fixing tools, vision or token claims requires hand-authored JSON import. | `CapabilityRulesUserPanel.vue:240`, `:319`, `:393`; `src/next/generation-v2/capability-rules/capabilityRuleCoreV1.ts:30`; generic User add/replace service supports full snapshots. | UI typed canonical assertion and selector editing over existing APIs. Import/export exists. No multi-path authoring UI test identified. |
| MC-04 | MEDIUM / BACKEND_WITHOUT_UI | Users cannot activate a whole Cloud pack or apply bulk Rewrite through the GUI; only individual rule controls exist. | `CapabilityRulesOverviewPanel.vue:324`, `:170`; `electron/ipc/generationV2CloudCapabilityRulesIpc.ts:61`; `src/next/generation-v2/capability-rules/cloudRulesActivationOverlayV1.ts:95`. | UI pack CAS controls and atomic confirmed rewrite plan. Do not claim current published pack uses override mode: publication was not fetched. No pack-control UI test. |
| MC-05 | MEDIUM / UI_GAP | Before toggling Cloud rules, users cannot read asserted value, provider/profile, selector or evidence. View Changes displays candidate JSON without current/candidate comparison. | `CapabilityRulesOverviewPanel.vue:345`, `:275`; `generationV2CloudCapabilityRulesIpc.ts:110` returns both current and candidate. | UI read-only semantics/evidence and before/after changes. Current tests assert wiring, not meaningful details. |
| MC-06 | MEDIUM / STATE_PERSISTENCE | A delayed subject/evidence request for A can overwrite B's newer selection in Inspector. | `ModelFactsInspectorPanel.vue:126`, `:206`, `:268`; `infra/db/services/authoritativeModelSubjectSetV1Service.ts:115`, `:197` awaits credential getters. | UI request identity guards/reset and held-response tests. Immediate mocks miss races; live latency not exercised. |

Component basenames above live in `src/ui-app/components/`; orchestrator is `src/ui-app/app/appChatApp.logic.ts`. Backend basenames live in `electron/services/` or `electron/ipc/` as stated.

## Coverage and exclusions

Provider setup, catalog/picker routes and Inspector deep links exist. Cloud check/apply/history/rollback/pin/resume and individual activation are reachable; failure feedback remains partial. User drafts/import/export/save/cancel are durable; GUI authoring is partial. Inspector provenance, winners/conflicts and Goal 4 rank/tie/CAS recovery exist; refresh and asynchronous selection are partial.

Compatible manual-model error handling and all-or-nothing picker source loading were observed but not promoted into this workstream's primary six. Current release pack mode is unverified. All findings are current-source traces; no Cloud Rules state, provider request, runtime, DB/profile or tests were exercised by this agent.

# Workstream 05 — Settings / Persistence / Recovery

Audit snapshot: `models-dev-capability-resolution` at `8d928d6d913d61e51052a8c52f2b665cac332c03`, inspected 2026-10-03 (Asia/Tokyo).

Status: complete. Final coordinator classifications are in findings.json; incremental checkpoints are preserved below. Read-only mapper supplies incremental findings; coordinator persists this dedicated report under the agent's file-write restriction.

Initial map: `SettingsPanel.vue` → `src/next/settings/*Client.ts` → `uiPreferenceStoreV2.ts` → `storeIpc.ts` / `configSchema.ts`; session settings through `chatSessionConfig.ts`, `conversationConfigUpdateQueue.ts`, `generationV2SessionConfigProjection.ts` → workspace IPC → DB config resolution. Recovery paths include `schemaMismatchRecovery`, `defaultSessionReset.ts` and `configProjection.ts`.

Inspect defaults/overrides, restart persistence, stale state, concurrent writes, reset and confirmations. Do not read or mutate the real application profile.

## Incremental evidence checkpoint

- Strong candidate: `src/next/settings/openRouterProviderSettingsClient.ts:10-26` depends on `globalThis.dbBridge`; if absent, read returns false and save returns without action. Current preload exposure and Generation V2 request consumption are being cross-checked against the exposed SettingsPanel control.
- Strong candidate: `electron/ipc/storeIpc.ts:70-71,90-98,116-118` allows exact configured keys only; provider policy clients use a dotted provider-scoped key while the schema allowlist contains the root. Verify failed acknowledgment handling, SettingsPanel reachability and downstream resolution before retention.
- Whole-namespace preference read/modify/write concurrency is under investigation; no actual settings changes have been attempted.

## Completed workstream findings

| Candidate | Severity / type | Actual exposed loop | Evidence | Minimal repair / test gap |
|---|---|---|---|---|
| 05-01 | MEDIUM / STATE_PERSISTENCE | Provider catalog override → Save → IPC rejects dot key → Saved → reload/startup ignores override. | `SettingsPanel.vue:2830`, `:1140`, `:1378`, `:1438`; `src/shared/modelCatalog/catalogPolicyResolverV2.ts:14`; `electron/ipc/storeIpc.ts:70`; `electron/config/configSchema.ts:111`; `providerCatalogStartupSyncV2.ts:40`. | Both: narrowly validated catalog authority and checked ack. No broad whitelist relaxation. UI fake store permits every key; real-bridge integration absent. |
| 05-02 | MEDIUM / DEAD_OR_LEGACY | OpenRouter require_parameters is editable but absent dbBridge makes read false/save no-op; V2 compiler never encodes it. | `openRouterProviderSettingsClient.ts:17`, `:24`; `SettingsPanel.vue:2284`, `:1388`; `electron/preload.test.ts:24`; `chatRequestV1.ts:225`. | UI hide/disable unsupported control under current support; do not resurrect retired bridge. Settings tests invent dbBridge at `:335` / assert it `:553`. |
| 05-03 | MEDIUM / STATE_PERSISTENCE | Rejected/failed preference save reports success/live update; restart exposes old value. | `src/next/generation-v2/renderer/uiPreferenceStoreV2.ts:40-43`; `SettingsPanel.vue:1404`, `:1426-1438`; `storeIpc.ts:100`. | Both bridge strict ack/error propagation + retain edits/retry/no success events on failure. Client tests accept undefined ack. |
| 05-04 | MEDIUM candidate / STATE_PERSISTENCE | Independent rapid edits can read the same preference namespace and overwrite each other. | `uiPreferenceStoreV2.ts:40-41`; `ChatSessionConsole.vue:1100`, `:1120`; logic `:3579`, `:3601`. | Atomic per-key main patch or shared serialization; held-response regression. Interleaving is static susceptibility, not executed production overlap. |
| 05-05 | MEDIUM / DEAD_OR_LEGACY | Network experiment switches persist, while no current startup/transport reads them and runtime info API is absent. | `SettingsPanel.vue:3182-3277`; `src/next/netExp/netExpClient.ts:87`, `:114`, `:125`; `configSchema.ts:101`; `en-US/settings.json:583`. | UI retire/disable and truthful copy; backend revival requires separate support choice. No behavioral validation test located. |

## Closed semantics and recovery coverage

`resolveGenerationConfigV2.ts:24` and `infra/db/repo/generationConfigV2Repo.ts:248` deliberately resolve global→project→conversation with TOP-LEVEL GROUP replacement; omitted groups inherit. Explicit disabled reasoning/web/image overrides are persisted; later global changes not applying is supported. Conversation CAS and update queue exist and are tested; they do not serialize the retained preference namespace.

Recognized schema mismatch backup/reset has native confirmation, safe default/cancel, DB+sidecar backup, lease/journal checks and config preservation. Prompt/recovery tests are present, not run. Interrupted backup/journal failures remain a test gap. Cache clear and template reset have explicit confirmations. General clearSafe lacks a production caller and is not automatically a product defect.

Proxy Test applies/persists draft settings before probing; generic multi-domain Save may partially save before proxy rejection. These are semantics/UX questions, not retained defects without a defined transactional/test-only promise.

Components live under `src/ui-app/components/`, startup sync under `src/ui-app/app/`, legacy setting client under `src/next/settings/`, OpenRouter compiler under `src/next/generation-v2/providers/openrouter/`. No tests, runtime/profile/DB access, native rebuild, network/provider calls or code changes. Coordinator persisted mapper's report under its read-only file constraint.

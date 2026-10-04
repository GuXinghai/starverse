# 06 — Error handling, diagnostics, lifecycle, and privacy boundaries

## Scope checkpoint

- Snapshot: branch `models-dev-capability-resolution`, HEAD `8d928d6d913d61e51052a8c52f2b665cac332c03`; audit date 2026-10-03 (Asia/Tokyo).
- Authorized change: this report only. Production code, user DB/profile, settings, Cloud Rules, credentials, native binaries, `.codex/config.toml`, and `pelican-bicycle.html` remain untouched.
- Method: static UI → renderer state/client → IPC → service/repository traces, plus inspection of existing tests. No tests, Electron/runtime smoke, network requests, or native rebuilds are run by this workstream.
- Focus: provider/network/auth failures, retry/offline behavior, interrupted generation/startup recovery, normal UX versus diagnostics, sensitive logging, and security boundaries.
- This is an incremental workstream report. Finding severity and closure remain subject to coordinator cross-check; a phase/MVP/stabilization status is not full-project completion.

## Initial file map

- Chat error UX: `src/ui-kit/chat/ChatErrorPanel.vue`, `src/ui-app/components/ChatSessionConsole.vue`, `src/ui-app/app/networkErrorDisplay.ts`.
- Network error contracts: `src/shared/network/networkErrorEnvelope.ts`, `electron/ipc/providerNetworkError.ts`, provider Generation V2 runtimes.
- Lifecycle: `electron/services/generationOperationRuntimeRegistryV2.ts`, `electron/services/generationOrphanRecoveryV2.ts`, `electron/services/generationBodyCheckpointV2.ts`.
- Startup recovery: `electron/data-epoch/schemaMismatchRecoveryPrompt.ts`, `schemaMismatchRecovery.ts`, `epoch2StartupDiagnostics.ts`, epoch-2 main entry.
- Privacy/security: `electron/ipc/logSanitizer.ts`, `electron/debug/rawGenerationRequestStore.ts`, credential IPC, shell/dialog grants, main-window/preload boundaries.

## Findings

### ER-01 — Provider failure credential redaction misses URL-bearing text and provider header keys

- Candidate severity/type: **HIGH / SECURITY_PRIVACY** (P1). Confidence: **high** for the implementation defect; conditional user impact requires a provider/source error to echo a credential. No claim is made that real credentials have leaked.
- User scenario: a failed provider call returns an error message such as `x-api-key: EXAMPLE_SECRET See https://docs.example/help`, or a JSON error contains a header-shaped `x-api-key` / `x-goog-api-key` field. The user opens or copies the product's supposedly safe failure details.
- Exact incomplete loop: HTTP body → `createProviderFailureV2` → credential sanitization → persisted `errorFact` → live/history chat error or provider details → copied JSON. Credential redaction silently misses these shapes; the safe projection only bounds size and does not re-sanitize.
- Evidence: `src/shared/provider/providerFailureV2.ts:305` disables credential-label detection whenever any URL is present (`!hasUrlShape`); `:310` can then return the complete string unchanged, and `:323` never runs the label-redaction regex. `:356` omits `x-api-key` and `x-goog-api-key` from the JSON-key redaction allowlist. The direct OpenAI Responses body capture is `electron/services/openAIResponsesStreamRunnerV2.ts:244`; terminal `errorFact` persistence/projection is `:216` / `:225`. Live summary/detail projection is `src/ui-app/app/appChatApp.logic.ts:1757` / `:1783`; restart/history projection is `src/next/generation-v2/renderer/generationV2BranchProjection.ts:49` / `:59`. `src/shared/provider/providerFailureUiProjectionV2.ts:53` returns small failures unchanged. `src/ui-app/components/ProviderFailureDetailsV2.vue:17` serializes the projection, and `:29` copies it. Chat detail copy is `src/ui-kit/chat/ChatErrorPanel.vue:77`.
- Minimal repair direction: **backend/shared sanitizer**. Redact credential labels independently of ordinary URL preservation, cover the actual provider header names in JSON, and add synthetic composition cases (credential + safe URL, nested headers). Preserve non-secret provider facts, URL query redaction, bounded raw facts, and structured authority namespaces.
- Existing tests: `src/shared/provider/providerFailureV2.test.ts:30` tests Authorization plus a proxy URL; `:50` tests URL query credentials. Neither covers a credential label followed by a safe URL or structured provider header keys. `generationV2BranchProjection.test.ts:88` validates provider-message preservation, not this security boundary. Tests were inspected, not executed.
- Executed cross-check: the coordinator ran the current exported `createProviderFailureV2` with dummy strings using native Node TypeScript transformation. `docs/analysis/product-gap-audit-20261002/synthetic-redaction-probe.json` confirms: label-only `x-api-key` is redacted; label plus HTTPS URL retains the dummy token with zero redactions; nested `x-api-key` / `x-goog-api-key` retain it with zero redactions; structured `api_key` control is redacted. No real credential, DB/native module, network request, or dependency installation was used. This confirms the redaction defect; a real provider echo and full Electron/UI copying were not executed.

### ER-02 — OpenAI Responses timeout loses the timeout fact

- Candidate severity/type: **MEDIUM / ERROR_RECOVERY** (P2). Confidence: **high** for the explicit abort-reason path; no real stalled provider request was made.
- User scenario: an OpenAI Responses request or response stream stalls until the five-minute deadline. The answer fails with `PROVIDER_REQUEST_OPEN_FAILED` or `PROVIDER_RESPONSE_STREAM_FAILED`, without a timeout reason explaining whether to retry or check the connection.
- Exact incomplete loop: `electron/services/openAIResponsesStreamRunnerV2.ts:42` sets the default deadline; `:85` aborts with the string `timeout`; `:101` rejects the race with that string. In the catch at `:408`, `scope.timedOut()` is used only to distinguish cancellation; `:409` passes the bare string to `providerFailureFromUnknownV2`. That helper at `src/shared/provider/providerFailureV2.ts:521` / `:529` obtains no structured fields from a string; the creator at `:473` only creates transport fields for an object or `Error`. The selected generic diagnostic at runner `:418` survives, but the explicit timeout fact does not. The UI then falls back to that diagnostic through `src/ui-app/app/appChatApp.logic.ts:1757`.
- Minimal repair direction: **backend/shared failure capture**, with a small UI display mapping if desired. Preserve the known timeout as a structured transport fact while maintaining the distinction from user cancellation. Do not add automatic paid retries.
- Existing tests: inspected network-message tests cover a `timeout` display token (`src/ui-app/app/networkErrorDisplay.test.ts:77`), which this new runner path never supplies. No deadline → ProviderFailureV2 → chat assertion was located in the searched test trees. Test execution and actual fetch-abort behavior remain unverified.

### ER-03 — New failure facts reach normal chat as technical diagnostics without recovery guidance

- Candidate severity/type: **MEDIUM / ERROR_RECOVERY** (P2; related I18N_A11Y). Confidence: **high** for the presentation/wiring gap; user impact varies with provider message quality.
- User scenario: an authentication error, raw non-JSON proxy/server error, or DNS failure reaches the transcript. The collapsed panel shows `error`, a phase, and a Starverse diagnostic code/provider text, with generic retry buttons but no integrated check-key, connection, backoff, or model-switch guidance.
- Exact incomplete loop: new runtime facts become a summary at `src/ui-app/app/appChatApp.logic.ts:1754` with provider/transport text and diagnostic code, but no `networkError`; history/restart uses the same omission at `src/next/generation-v2/renderer/generationV2BranchProjection.ts:46`. `toErrorPanelView` at `appChatApp.logic.ts:1447` only applies localized network copy when `networkError` exists. `src/ui-kit/chat/ChatErrorPanel.vue:26` puts phase/code/provider into the normal summary and `:89` renders the raw completion class. Retry controls exist (`src/ui-app/AppChatApp.vue:758`, `:771`), so this is missing explanation/guidance rather than missing all recovery actions. The older normalized action hint at `appChatApp.logic.ts:1257` reads `runVM.error.normalized`; it is not populated by these message-summary paths.
- Minimal repair direction: **UI only**, if derived strictly from explicit HTTP/transport facts. Keep ProviderFailureV2 fact storage and source namespaces unchanged; give normal chat a localized primary explanation/action, with diagnostic codes and raw facts in expandable details. Preserve ambiguous provider outcomes without inventing semantic certainty.
- Existing tests: `src/ui-app/AppChatApp.errorLazyHydrate.ui.test.ts:7` renders a bubble directly and `:25` explicitly expects the diagnostic code in ordinary text; `src/next/generation-v2/renderer/generationV2BranchProjection.test.ts:88` expects provider-message preservation. These tests protect the current technical presentation, not a full runtime error → useful recovery loop. Network localization tests exercise a separate helper.

### ER-04 — Non-schema startup failures leave the user with a code and exit

- Candidate severity/type: **MEDIUM / ERROR_RECOVERY** (P2). Confidence: **high** for the static entry flow. This is a support/recovery explanation gap, not a request to loosen fail-closed startup or reset more data classes.
- User scenario: epoch-2 database/manifest/lease initialization or credential storage fails for a supported non-schema diagnostic. Startup shows `Starverse startup failed` plus an `EPOCH2_*` / `LINUX_CREDENTIAL_STORAGE_*` code and quits. The user has no product-provided explanation or next safe step.
- Exact incomplete loop: `electron/epoch2MainEntry.ts:28` keeps only a narrow diagnostic code; the entry catch at `:79` treats only `EPOCH2_DATABASE_SCHEMA_MISMATCH` specially; `:90` displays the code and `:91` quits. Recovery retry failures similarly use code-only dialogs at `:62` and `:73`. The schema mismatch flow is already explicit and correctly limits destructive reset (`electron/data-epoch/schemaMismatchRecoveryPrompt.ts:7` / `:31`).
- Minimal repair direction: **backend/main-process UI**, using localized messages and bounded diagnostic copy or support instructions for known codes. Keep unknown errors safe, preserve the specific schema-only backup/reset authority, and keep ABI/permissions/corrupt-journal/identity failures out of reset automation.
- Existing tests: `electron/data-epoch/schemaMismatchRecoveryPrompt.test.ts:17` / `:24` / `:37` protect bypass, confirm, safe default/cancel; `epoch2StartupDiagnostics.test.ts` protects sanitized schema-recovery output. They do not demonstrate that non-schema startup errors provide understandable actionable UX. No startup/profile/runtime mutation was performed.

## Positive closure evidence and excluded candidates

- Restart recovery is implemented: `electron/mainV2.ts:169` runs `recoverGenerationOrphansV2` before Generation IPC/window startup; `electron/services/generationOrphanRecoveryV2.ts:252` marks interrupted attempts and `:263` terminalizes the answer/operation with `stream_interrupted`. Native tool-wait facts are validated before preserving awaiting state. This is not evidence that arbitrary corrupt DB state is repaired; incoherent state deliberately fails closed.
- The coordinated runtime registry protects persisted binding/projection authority, routes aborts to the bound operation, and has a catch for runner rejection (`electron/services/generationOperationRuntimeRegistryV2.ts:194`). Unit tests include interleaved operations, unpersisted projection rejection, runner rejection, branch/conversation/project drain, and fail-closed drain timeout (`generationOperationRuntimeRegistryV2.test.ts:205`, `:271`, `:295`, `:441`). Runtime tests were not run here.
- Credential status IPC returns configuration/revision/availability and a fixed mask, rather than returning a stored API key (`electron/ipc/generationV2CredentialSettingsIpc.ts:88` / `:91`). No real credential values were read.
- Normal startup logs are code-only, renderer console forwarding is metadata-only when explicitly enabled (`electron/windows/mainWindow.ts:81`), and raw-generation store failures log fixed codes. Inspected logging paths did not establish an additional normal-log secret leak. Full log-site review is incomplete.
- Browser remote content is placed in a sandboxed view without the main preload (`electron/services/inappBrowser.ts:246`); lack of a common IPC sender gate by itself was not retained as an exploitable remote boundary claim.
- A potential historical Retry-as-new enablement mismatch was sent to the coordinator/main-journey workstream for deduplication: the button uses `canRetryReplaceInUi` (`AppChatApp.vue:769`), whose last-question restriction is `appChatApp.logic.ts:7178`; the handler only applies the head-equals-answer restriction to replacement (`:7257`). This report does not make the final finding decision.

## Coverage and limits

| Area | UI | Backend / wiring | Persistence | Error / recovery | Existing test evidence | Status |
| --- | --- | --- | --- | --- | --- | --- |
| Provider failures (Responses/new facts) | Chat error panel, details, retry controls | HTTP/stream failures captured and projected | Error facts persisted into operation/history | Timeout fact and useful primary guidance incomplete | Fact/redaction/projection unit tests; no executed full IPC/UI loop | **PARTIAL** |
| Legacy structured network display | Local endpoint/provider diagnostics | Network envelope and localization helper wired in inspected console paths | Not fully traced | Specific DNS/auth/rate/proxy copy exists | `networkErrorDisplay.test.ts`, console network tests inspected | **PARTIAL** |
| User retry/cancel | Reachable for latest answer | Renderer command client → provider IPC/runtime registry | Operation binding persists | Explicit abort and failed-answer retry exist; historical retry enablement sent for dedup | Runtime registry unit tests; end-to-end execution unverified | **PARTIAL** |
| Process-interrupted generation | Recovered failed answer is projected | Startup orphan pass wired before window | Transactional terminalization | Coherent interruptions and native tool waits handled; arbitrary corruption fails closed | Native tool-wait/rejection tests inspected; interruption-to-visible-retry execution unverified | **PARTIAL** |
| Schema mismatch backup/reset | Native confirmation dialog | Schema-specific backup/reset authority | Existing DB artifacts backed up | Safe cancel/default; config/credentials preserved | Prompt/recovery/diagnostic unit tests present, not executed | **CLOSED** (static scoped contract only) |
| Other startup failures | Native code-only error box | Fail-closed entry path | No unauthorized reset | Product explanation/recovery directions absent | Schema tests do not cover actionable non-schema UX | **PARTIAL** |
| Provider failure secret redaction | Safe-details/copy surfaces exist | Shared sanitizer misses two credential shapes | Unsanitized matched values can reach persisted error facts | ER-01 | Current synthetic redaction tests miss composition/header cases | **PARTIAL** |
| Main-window renderer crash/load failure | No recovery UI located | No `render-process-gone` / `unresponsive` handler located in searched production tree | Main service stays authoritative; reload details not fully traced | Recovery behavior uncertain | Not inspected enough for retained issue | **UNKNOWN** |
| Normal logs / complete IPC security boundary | Diagnostic surfaces inspected | Representative log/window/preload/credential paths only | Raw debug-store retention/consent semantics not fully reviewed | No additional confirmed exploit/leak retained | Partial static test inspection only | **UNKNOWN** |

No tests, native rebuilds, Electron/UI smoke, network requests, DB changes, settings changes, or Cloud Rules mutations were performed. Prior local smoke reported by the user is context; it does not verify the specific failure cases above. This workstream does not declare the whole project closed.

## Follow-up checks

1. ER-01's pure-function defect is independently confirmed by the coordinator's dummy-token probe. Prioritize the narrow sanitizer repair plus regressions for safe URLs/nested headers; do not infer actual historical credential exposure.
2. For ER-02, use an isolated fixture with a never-resolving response/read and fake timers; assert timeout identity, persisted fact, and transcript primary explanation without a paid request.
3. Check ER-03 against current owner decisions before choosing the precise UX. Preserve raw provider facts in details and keep derived UI guidance distinct from authoritative failure storage.
4. Confirm ER-04's code-specific support copy in native startup tests; preserve schema-only reset and safe cancellation.
5. Validate interruption → restart → visible failed answer → retry using isolated Electron/profile state. Review main-window crash recovery and raw debug-store deletion/retention separately if the next audit batch includes them.

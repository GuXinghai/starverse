# Bounded plans after the first repair wave

Date: 2026-10-03 (Asia/Tokyo). These are plans only, in the user's requested priority order. No implementation, real-profile smoke, provider request, Cloud Apply or runtime download is started. The ordering is local to this repair document; it does not assign a new global roadmap Goal number.

All five findings were revalidated at committed `4ac2de5`. Small current working-tree snippets confirm their remaining closure gaps after G-A/G-B. G-A's durable submission of an unloaded edit source does not solve search-hit navigation.

## 1. Native web-search contract closure — SV-PGA-006

**Problem and outcome.** The UI semantic builder still universally emits `maxResults` and `searchContextSize`, with optional `engine`. Anthropic supports native web search but rejects context/engine; Gemini GenerateContent requires those extra fields absent. Enabled ordinary UI search must produce a request that the chosen native contract actually encodes.

**Authority and scope.** Use the resolved capability projection and the selected registered provider/operation contract as the single field authority for both controls and semantic emission. Centralize the web-search projection/builder; keep strict compiler rejection for explicitly unsupported values. Inherited defaults for controls absent from a contract are not emitted. Unsupported user intent gets a visible explanation rather than silent reinterpretation. Preserve existing disabled search, Gemini Interactions image-search semantics and frozen retry snapshots.

**Expected seams.** `src/ui-app/app/appChatApp.logic.ts` semantic builder, `ChatSessionConsole.vue` controls, existing generation-control projection utilities, `resolvedCapabilityV2.ts`, and Anthropic/Gemini GenerateContent/OpenAI Responses/OpenRouter prepared compilation tests. Provider authority services supply the existing supported-field contracts; do not widen them merely to accommodate universal UI defaults.

**Acceptance.** Actual UI-built semantics flow through actual prepared compilers/IPC-shaped submission with synthetic capabilities and stub transport. Matrix: disabled search; supported defaults; explicit supported values; unsupported context/engine; Anthropic max-results range; Gemini fields absent; OpenAI Responses and OpenRouter controls unchanged; image-search branch unchanged. Assert request contents and clear rejected-control feedback, zero provider calls and no automatic resubmit.

**Boundary and risks.** No pricing/catalog/acquisition work, custom search engine implementation, provider contract weakening or silent catch-and-retry. Capability freshness and inherited settings must be resolved before building the packet. Stop if a new provider contract is needed; specify that separate contract first.

## 2. DOCX PDF selection closure — SV-PGA-007

**Problem and outcome.** `generationV2DfcService.ts` persists DOCX PDF output under `starverse-dfc-docx-pdf-v1`, but every PDF selection looks up the HTML converter contract. A ready DOCX option must select the exact immutable derived output that made it ready and carry that revision into preview/send.

**Authority and scope.** Bind ready options to their persisted derived-output provenance (source revision, target, producer contract/version and effective output revision) at the existing service/repository seam. Select revalidates that binding and provider compatibility, then updates the existing composer aggregate with its expected revision. Use that recorded producer identity; do not infer the producer from target `pdf_attachment`, MIME or a guessed alternate lookup. Keep the existing asset/DFC provenance authority and FK checks.

**Expected seams.** `electron/services/generationV2DfcService.ts`, DFC option/selection contracts only if needed to carry the binding, existing attachment/DFC repository lookup, composer IPC/client validation and focused service/IPC tests. Preserve HTML conversion and original/text routes.

**Acceptance.** Synthetic DOCX adapter output goes through real asset persistence → options → select → effective revision/hash → preview → prepared send attachment. Cover HTML/DOCX outputs for the same target, stale source/output, unavailable runtime, provider mismatch, revision conflict and tampered provenance. The existing packaged/live-installed DOCX smokes are a separate temporary-profile runtime checkpoint, admitted only when their required managed runtime/build is available; report unavailable prerequisites honestly. Node checks precede any required Electron ABI switch.

**Boundary and risks.** No converter replacement, automatic runtime installation, fallback to HTML, destructive draft reconstruction or real-profile use. Keep runtime/sandbox directories outside Vite watch scope. Ready must mean a verified output binding, not merely a completed adapter invocation.

## 3. Startup recovery closure — SV-PGA-011

**Problem and outcome.** Initial bootstrap errors are stored in `loadError`, while the topbar/settings entry is hidden when workspace mode is `none`. List refresh does not rerun initialization. The app must visibly distinguish loading, a ready empty workspace and failed initialization, with one usable retry path.

**Authority and scope.** Extract the existing initialization sequence into one bounded controller with explicit root loading/ready/error state and attempt identity. Render its failure/retry/settings entry independently of active conversation IDs. Retry re-reads persisted workspace/template authorities and executes the same reviewed initialization pipeline. Publish only the current attempt; coalesce duplicate retries. Keep configured template-reset side effects explicit and prevent a failed later stage from blindly repeating already accepted resets.

**Expected seams.** `src/ui-app/app/appChatApp.logic.ts` mount/bootstrap routine, `AppChatApp.vue` root/topbar rendering, workspace/template clients and isolated actual-App tests. Keep recovery UI above the conversation-owned composer/transcript scope.

**Acceptance.** Missing bridge and failure at workspace ensure, template read, projects read and transcript read show localized recovery plus settings. A later successful retry hydrates valid IDs/transcript/draft together. Cover duplicate retries, stale attempt responses, genuine empty state, template reset CAS and cancellation/deletion during recovery. Use synthetic bridge and isolated DB-backed authority fixtures; no real profile.

**Boundary and risks.** No DB reset/backup-recreate bypass, latest-project fallback, automatic retry loop or silent error-to-empty conversion. This Goal does not relax G-A predecessor/schema identity checks. Startup side-effect checkpoints need explicit tests before claiming retry idempotence.

## 4. Rules/Inspector semantic refresh — SV-PGA-009

**Problem and outcome.** Successful User Rules/source-priority saves update only their local panel. The active capability watcher is keyed to route/model/conversation/image mode; unchanged selection retains stale controls/Inspector. A successful semantic change must refresh the authoritative projection before the next user action.

**Authority and scope.** Publish one typed semantic-invalidation signal only after committed mutation; consume it through the existing authoritative resolver/current projection flow. Re-resolve the same selected subject and refresh controls plus Inspector with selection/attempt identity checks. Reuse existing priority/rule revision authorities, rather than introducing a second semantic version or UI-only capability cache. Include Cloud mutations only where they actually change active semantics; existing failed-check/freshness/diff closures from `4ac2de5` remain closed.

**Expected seams.** `ModelFactsSourcePrioritySettingsPanel.vue`, `CapabilityRulesUserPanel.vue`, their clients/IPC committed results, `appChatApp.logic.ts` capability refresh, `modelFactsInspectorV1Service.ts`, Inspector UI and relevant existing authority tests. Map the committed event path before implementation.

**Acceptance.** Save a rule/priority while route/model stay selected: winner, conflict/unknown provenance, capability revision, controls and Inspector refresh before send. Failed save emits no successful semantic invalidation. Out-of-order mutations/selection changes cannot publish another subject's Inspector. Frozen retry uses its original snapshot; stale initial send remains blocked, with no automatic send/resubmit.

**Boundary and risks.** No provider-data acquisition, pack migration, authority-priority redesign or repeat Cloud lifecycle repair. Do not resolve freshness by weakening stale-send checks. SV-PGA-018's async Inspector selection risk is a dependency to inspect at this seam, not a blanket claim that the entire separate finding is closed.

## 5. Historical search navigation closure — SV-PGA-010

**Problem and outcome.** A hit has a message/conversation identity but no branch identity; selecting it loads a default/latest transcript page and checks only loaded messages. An older-than-50 or alternate-branch hit must become visible/highlighted, or show a precise recoverable unavailable result.

**Authority and scope.** At the repository/navigation boundary, resolve an eligible visible branch containing the exact message with the existing branch-route authority. Prefer the currently selected branch when valid; otherwise use an explicit deterministic resolver result. A search hit does not gain authority to expose hidden/deleted route content. Load an anchored page (or bounded existing pagination) for that branch, bind through G-A's centralized scope transition, then focus after DOM publication under the same navigation lease. Treat the returned focus result as part of the operation's outcome.

**Expected seams.** `infra/db/repo/generationV2SearchRepo.ts` plus existing branch/conversation-read repositories as needed, workspace IPC/client anchored-read contract, `appChatApp.logic.ts` search-hit navigation and `SearchModal.vue`. Keep indexing/query/rebuild behavior unless the closed navigation contract requires a narrowly typed result extension.

**Acceptance.** Actual indexed synthetic hits → eligible branch → anchored transcript → visible target/highlight for old and alternate-branch messages. Cover inherited messages on multiple branches, hidden/deleted target, project relocation, target deleted after search, rapid competing hit navigation and cancel during draft-conflict confirmation. Navigation preserves unrelated drafts/edit sessions; an unavailable target remains actionable without silently closing the modal.

**Boundary and risks.** No eager full-history loading, guessed branch, unconditional cursor writes or broad search-ranking redesign. G-A's unloaded edit-source submission uses durable edit identity and is already independent of transcript paging; reuse its scope model without coupling these two authorities.

## Entry and completion rule for each plan

Before implementing any one plan, map its current execution path and freeze its concrete contract/acceptance boundary. Give one writer ownership of shared app logic, coordinate any backend/renderer contracts, obtain read-only risk review, and validate with the actual service/repository/UI path. Each closes as a coherent Goal with a new scoped closeout; passing mocks alone or completing an adjacent feature is insufficient. The other plans remain unimplemented until their own authorized work begins.

# Workstream 04 — Feature-to-Backend Wiring

Audit snapshot: `models-dev-capability-resolution` at `8d928d6d913d61e51052a8c52f2b665cac332c03`, inspected 2026-10-03 (Asia/Tokyo).

Status: complete. Final coordinator classifications are in findings.json; incremental checkpoints are preserved below. Read-only mapper supplies incremental findings; coordinator persists this dedicated report under the agent's file-write restriction.

Scope: reachable UI → state → IPC → service/repository, visible controls with no backend effect, incomplete results, and user-facing capabilities that cannot be reached. Internal infrastructure without a product UI is not automatically a finding. No application or state mutations, tests or runtime launches.

## Completed workstream findings

### FW-01 — HIGH / BROKEN_CLOSURE: native web search receives incompatible UI fields

Choose Anthropic native chat or Gemini GenerateContent, enable native web search and send. `src/ui-app/components/ChatSessionConsole.vue:2471` mounts provider-independent settings; `src/ui-app/app/appChatApp.logic.ts:6334-6342` always adds maxResults/searchContextSize except Gemini interactions image. Anthropic supports search but excludes context size (`electron/services/anthropicGenerationAuthorityV2Service.ts:131-139`); its compiler `anthropicMessagesPreparedRequestCompilerV2.ts:132` invokes strict validation at `src/next/generation-v2/capability/resolvedCapabilityV2.ts:377`. Gemini authority `geminiGenerateContentGenerationAuthorityV2Service.ts:185-207` explicitly requires those extra fields absent. OpenAI Responses encoding also excludes maxResults.

Minimal UI/renderer repair: provider-aware control availability and semantic emission. Keep backend strict contracts. Local editor tests and OpenRouter-only send-event mocks never reach native compiler/IPC with real semantic options.

### FW-02 — HIGH / BROKEN_CLOSURE: search opens a conversation without the matching message

Search an older-than-latest-50 or other-branch message. `SearchModal.vue:103` closes immediately; logic `:2990-3011` opens default/latest branch then calls focus. `generationV2WorkspaceClient.ts:75` defaults readBranch to 50. Logic `:2719-2732` only looks among loaded messages and returns false; caller ignores failure. `infra/db/repo/generationV2SearchRepo.ts:18-25` has no branch identity. Existing earlier-page and branch-anchor helpers are bypassed.

Minimal repair: anchored/page loading and branch resolution, then focus or recoverable unavailable message. Both for branch-aware result routing; UI for older pages alone. Repo indexing/query tests `:26-54` do not test navigation closure.

### FW-03 — MEDIUM / BACKEND_WITHOUT_UI: branch management has no reachable controls

Backend preload `electron/preload.ts:170`, renderer workspace client `:103`, IPC `:187` and repo `:69` expose durable fork/rename/delete. Logic `:6908` implements and `:7747` exports fork/delete, but no Vue caller exists. `AppChatApp.vue:475` offers selection/load-more only; unnamed ID `:486` slices to eight characters including branch: prefix. Rename/remove require outside means.

Minimal UI repair: small branch menu using existing safe clients, confirmed deletion and readable fallback labels. Dedupe MAIN-03. Backend tests cannot assert reachability.

### FW-04 — LOW / ERROR_RECOVERY: clipboard failure is invisible

Message/detail copy buttons call logic `:6124-6137` / `:1270-1277`; rejected clipboard writes are swallowed. UI feedback/selectable fallback is a small repair. No rejection test identified. Coordinator may leave this below the retained top priorities.

## Coverage / ruled-out concerns

Search query/index rebuild, favorite reordering, branch selection and plugin install/cancel/enable/disable/health have reachable paths. Search navigation/native web/branch management are PARTIAL. Plugin owner/internal controls are explicitly disabled; tool definitions/execution/continuation have backend bridges but ordinary UI emits tools disabled, so product scope is UNKNOWN rather than a defect.

All references to logic/components are under `src/ui-app/`; renderer client under `src/next/generation-v2/renderer/`. Current-source static inspection only; no tests/runtime/state/network/native rebuild.

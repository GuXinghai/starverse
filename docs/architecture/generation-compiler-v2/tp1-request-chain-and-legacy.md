# TP1 — Request chain, sources of truth, and legacy paths

Verification baseline: local `main@6fb6ad59a9cbe7710a0ec6a65c70ae860afbb66b`; branch-only evidence from `HEAD@067171a4c4d55f147340677c7e7f046e95311bd0`. Verified 2026-07-13. Goal 2 must first reconcile the 54-behind/2-ahead branch split; neither side alone is the implementation base.

## Scope

Map every user generation action from UI through config resolution, DB transaction, request building, transport, stream finalization, and branch projection. Freeze the single owner for each fact and delete every historical fallback or duplicate entry.

## Current code evidence

| Flow | `main` evidence | Actual behavior |
|---|---|---|
| Initial send | `src/ui-app/app/appChatApp.logic.ts:10233-10328`, `10131-10230`; `infra/db/worker/handlers/branchContextHandlers.ts:93-157`; `src/ui-app/app/providerRuntimeSendCoordinator.ts:160-263` | Provider/model is read from current session, DB creates/choses answer first, then provider-specific paths reread current reasoning/web/image/sampling. OpenRouter and seven experimental providers diverge. |
| Regenerate | `src/ui-app/app/appChatApp.logic.ts:7845-7863`, `10690-10790`, `9393-9530`; `infra/db/worker/handlers/branchContextHandlers.ts:222-280` | Historical answer→chosen→question→OpenRouter fallback chooses provider/model, but streaming reads current UI config. Result is a mixed request. |
| Retry replace | `src/ui-app/AppChatApp.vue:571-583`; `src/ui-app/app/appChatApp.logic.ts:10982-11081`; `infra/db/worker/handlers/branchContextHandlers.ts:516-587`; `infra/db/repo/branchRepo.ts:876-897` | Current chosen is validated and atomically hidden/replaced/chosen, but config is mixed and there is no operation idempotency. |
| Edit resend | `src/ui-app/app/appChatApp.logic.ts:10844-10973` | Historical route plus current stream configuration; DB mutation precedes final config resolution. |
| Branch send | `src/ui-app/app/appChatApp.logic.ts:10559-10580`; `infra/db/repo/branchRepo.ts:514-545` | Branch graph is copied/switched; next send is a normal current-config send. Candidate selection moves head to deepest non-tool descendant. |
| Tool continuation | `src/next/context/buildMessages.ts:3-88`; `docs/architecture/provider-architecture/STARVERSE_PROVIDER_ARCHITECTURE_CONTRACT.md:64`; `src/next/live/openRouterLiveStream.ts:589-600` | Existing code can serialize tool history but has no provider-neutral execution/continuation loop. |
| Image continuation | `src/ui-app/AppChatApp.vue:543-555`; `src/ui-app/app/appChatApp.logic.ts:8126-8175` | Image regenerate is question regenerate; no explicit image-edit/continuation operation exists. |

Data relationship evidence:

- `infra/db/repo/messageRepo.ts:655-670`: an assistant directly under a question becomes its own `answer_root_id`; descendants retain that root.
- `infra/db/repo/messageRepo.ts:674-679`: when inference fails, grouping silently falls back to the conversation's last user message. This must be deleted.
- `branch_choice` owns chosen answer per branch/question; `branch.head_message_id` owns the continuation insertion point.
- `infra/db/repo/branchRepo.ts:530-545`: choosing an answer root may move head to its deepest non-tool continuation, so chosen root and head message are related but not identical facts.

Branch-only transition evidence:

- `src/ui-app/app/appChatApp.logic.ts:10227-10270`, `10605-10645`: initial answer transaction and V1 snapshot persistence are separate.
- `src/ui-app/app/appChatApp.logic.ts:11440-11505`: edit resend resolves current snapshot after DB commit and never persists it.
- `src/ui-app/app/appChatApp.logic.ts:11557-11711`; `infra/db/worker/handlers/branchContextHandlers.ts:100-192`: explicit retry commands and idempotency are useful transaction material.
- `src/next/generation/assistantAnswerGenerationSnapshot.ts:1-23`: V1 snapshot fields are wide `Record<string, unknown>` objects and are not V2 semantic truth.

Architecture evidence:

- `docs/architecture/provider-architecture/STARVERSE_PROVIDER_TARGET_ARCHITECTURE.md:95-102,227-261,344-357` already requires one intent, native adapters, capability-driven send plan, native continuation artifacts, and legacy removal.
- `docs/architecture/provider-architecture/STARVERSE_PROVIDER_ARCHITECTURE_CONTRACT.md:82-90,154-156` makes runtime capability an evidence intersection and native request bodies adapter-owned.
- `docs/adr/003-remove-generation-pipeline-switch.md:7-18` names `GenerationFacade`, but no such implementation exists on main or HEAD. Treat this as desired architecture, not current fact.

## Normative decisions

1. The only public generation entry is the V2 command layer; UI never calls builders, transports, DB branch mutations, or provider runtime switches directly.
2. Every command carries explicit `branchId`, `questionId`, `targetAnswerRootId` where answer-scoped, `operationId`, and one semantic intent/snapshot reference. No target inference.
3. DB transaction commits answer creation, snapshot, operation, chosen, head, and replace-hide together. Streaming begins only from the committed operation.
4. Initial send and regenerate resolve current semantic config before transaction. Both retry commands load only the explicit chosen target's immutable V2 snapshot.
5. Chosen answer root and branch head remain separate typed fields. Commands validate the allowed head group and follow-up-question constraint explicitly.
6. Message insertion requires explicit question and answer root. Last-user grouping fallback is forbidden.
7. Provider continuation is an explicit artifact/request sequence owned by a provider package. Serialized history alone is not continuation.
8. No action may call `startStreamingForAssistantTurn()` or any equivalent helper that reads current UI/session state after commit.

## Target modules and data flow

```text
UI command
  -> GenerationCommandService
     -> resolve current config OR load target snapshot
     -> capability binding + preflight
     -> compile preview/ledger
     -> GenerationRepository.commitCommand(transaction)
        -> operation + answer + snapshot + choice/head + optional hide
  <- committed projection
UI switches immediately
  -> GenerationRunner.claim(operation)
     -> compile persisted snapshot
     -> PreparedProviderRequest(bytes, hash, request sequence)
     -> provider transport
     -> terminal finalizer(content/status/error only)
```

New/owned files:

- `src/next/generation-v2/commands/*`
- `src/next/generation-v2/domain/*`
- `src/next/generation-v2/compiler/*`
- `src/next/generation-v2/runner/*`
- `infra/db/repo/generationV2Repo.ts`
- narrow UI adapter composables; `appChatApp.logic.ts` must cease owning generation orchestration.

## Mandatory deletions

- `resolveLegacyOpenRouterRuntimeSelection` and answer→chosen→question fallback.
- `startStreamingForAssistantTurn()` after all callers move.
- OpenRouter-versus-experimental send fork and provider runtime switch as generation entrypoints.
- implicit last-user message grouping.
- old branch regenerate/retry IPC commands after V2 commands own all callers.
- UI/provider model regex and direct builder/transport calls.
- tests whose sole contract is historical fallback, mixed config, or provider-switch priority.

## Exact command examples

```ts
regenerateQuestionWithCurrentConfig({
  operationId, branchId, questionId, currentConfigRevision
})

retryChosenAnswerAsNew({
  operationId, branchId, questionId, targetAnswerRootId
})

retryChosenAnswerReplacing({
  operationId, branchId, questionId, targetAnswerRootId
})
```

All return `{operation, newAnswerRootId, chosenAnswerRootId, branchHeadMessageId, visibleCandidates}` from the committed transaction. No async cache inference is permitted.

## Tests

- Characterize all current actions through exact route/config/source assertions before deletion.
- Command integration tests begin at semantic intent, not provider builder.
- Reject stale chosen, wrong question, invalid head group, follow-up question, missing snapshot, and repeated different-payload operation id atomically.
- Confirm chosen/head switches immediately and never rolls back on completed/failed/cancelled/interrupted.
- Confirm no current-session read occurs inside runner/codec/transport.
- Architecture guards forbid UI imports of provider adapters/transports and forbid provider packages importing session/composer state.

## Acceptance

- One command entry and one transaction seam cover every generation action.
- Source-of-truth matrix has one owner per fact and zero runtime fallback.
- Request chain from UI through exact bytes is traceable by operation/request sequence.
- Existing branch invariants remain: regenerate/as-new preserve old candidate; replace hides old candidate; all committed new answers remain chosen/head regardless of terminal result.

## Risks and unresolved items

| Severity | Risk | Trigger / impact | Control |
|---|---|---|---|
| Blocker | Branch is 54 commits behind main and 2 ahead | Implementing directly on either side loses changes | Reconcile to one Goal 2 baseline before production edits. |
| High | First-send snapshot is non-atomic on HEAD | Chosen streaming answer without retry truth | Move snapshot into command transaction. |
| High | Tool/image continuation absent | V2 falsely claims full continuation | Implement explicit provider artifacts and request sequences; block unsupported operations. |
| High | Historical route/current config mixing | Nondeterministic retry/regenerate | Delete helper and require semantic snapshot/current resolution before commit. |

Owner decisions before Goal 2: define image continuation product scope (native edit versus sibling-only); choose automatic transport retry policy separately from user retry. All other TP1 decisions are architecture requirements.

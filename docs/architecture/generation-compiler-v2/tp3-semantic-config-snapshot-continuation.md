# TP3 — Semantic configuration, persistence, snapshot, and continuation

Verified against main/HEAD and provider contracts on 2026-07-13.

## Scope

Replace all session/provider-specific generation owners with one semantic config, persist its inheritance state, atomically freeze an immutable answer snapshot, and persist provider-native continuation artifacts without treating them as user configuration.

## Current evidence

- `main:src/ui-app/app/chatSessionConfig.ts:41-66,240-295,324-376` owns separate `model`, `reasoning`, Gemini thinking, web, image, and sampling objects.
- Persistence is split among `reasoningPrefsScope`, OpenRouter search/sampling/image stores, and a Gemini conversation meta key. Resolution is conversation > project > global, with silent disable/empty fallback at `appChatApp.logic.ts:7631-7680`.
- HEAD still retains split owners in `src/ui-app/app/chatSessionConfig.ts:50-74`.
- HEAD snapshot uses five `Record<string, unknown>` groups (`src/next/generation/assistantAnswerGenerationSnapshot.ts:1-23`), stores both `requestPatch` and `requestParams` (`appChatApp.logic.ts:9408-9411`), and executor consumes the wire patch (`:9535-9672`).
- Initial snapshot is persisted after `beginTurn`, compatible snapshot can be callback-written, and edit resend may never persist one (TP1 evidence).
- Attachment snapshot has only id/include/payload-kind/status (`appChatApp.logic.ts:9421-9430`) and lacks revision/hash/conversion/descriptor.
- Provider-native continuation support is asymmetric: Anthropic accumulator/replay exists; OpenAI response items, Gemini native replay, and DeepSeek tool reasoning replay are incomplete.

## Semantic ownership model

```ts
type GenerationConfigV2 = {
  schemaVersion: 2
  providerBinding: ProviderBindingRef
  generation: {
    maxOutputTokens?: number
    temperature?: number
    topP?: number
    topK?: number
    seed?: number
    stop?: string[]
    candidateCount?: number
    frequencyPenalty?: number
    presencePenalty?: number
    repetitionPenalty?: number
  }
  reasoning: ReasoningIntent
  web: WebSearchIntent
  image: ImageGenerationIntent
  tools: ToolPolicyIntent
  attachments: AttachmentIntent[]
  providerExtension: ProviderSemanticExtension
}
```

Rules:

- Omitted means inherit; explicit `off`/`disabled` is a real value. `null` is not overloaded.
- A provider extension is a closed discriminated union owned by exactly one contract package; it is not JSON, request patch, or wire path.
- Semantic values may be broader than one model, but compiler must disposition every explicit path as consumed or rejected.
- Credentials, authorization, client/proxy objects, abort state, file bytes/data URLs, tool results, and response artifacts are excluded.

## Persistence model

Fresh V2 schema only:

The epoch-2 core graph and its unique schema composer are staged with zero
activation and no production caller in `infra/db/v2/coreConversationSchema.sql`
and `infra/db/v2/schemaComposerV2.ts`. They provide the strict
project/conversation/message/answer-root/branch/choice/hide foreign-key anchors
below. Snapshot, operation, continuation and request/attempt tables remain
pending and may only enter through that composer; no standalone or legacy-database
schema entrypoint is permitted. The next dependency is D1 immutable snapshot
authority, followed by the B atomic command transaction and then the C
request/attempt repository.

```text
generation_config_v2
  owner_kind(global|project|conversation)
  owner_id
  revision
  semantic_json
  schema_version
  created_at / updated_at

assistant_generation_snapshot_v2
  answer_root_id UNIQUE
  operation_id UNIQUE
  semantic_json
  resolved_config_revision_set_json
  provider_binding_json
  capability_revision
  schema_version
  snapshot_hash
  created_at

provider_continuation_artifact_v2
  answer_root_id
  provider_contract_id
  request_sequence
  artifact_kind
  artifact_json_or_blob_ref
  artifact_hash
  created_at
```

`generation_config_v2` stores sparse scope values. `resolveGenerationConfigV2()` performs one deterministic global→project→conversation merge and returns both resolved semantics and exact revision set. No provider-specific persistence owner survives.

## Immutable snapshot

Implementation status (2026-07-15): the strict canonical value/JSON/hash codec is
staged with zero activation and returns only `decoded_unverified`. It directly
binds `answerRootId` and `operationId`, requires every resolved semantic section,
and includes config revisions plus provider/capability/attachment/tool evidence.
It does not issue runtime/compiler authority; that remains dependent on private
resolver-issued facts and the later atomic command transaction.

`AssistantAnswerGenerationSnapshotV2` contains:

- complete resolved semantic config;
- provider/model/endpoint/profile/protocol contract identifiers and revisions;
- capability revision/evidence binding used at commit;
- stable attachment asset id + immutable revision/hash, include decision, conversion/sending selection, and provider file descriptor reference;
- tool enablement, allow scope, side-effect confirmation policy (not the confirmation result);
- closed tool choice semantics: `omitted`, explicit `auto`, `none`, `required`,
  or `named(toolId)` where the named tool is in the persisted allowlist; each
  provider compiler still rejects choices unsupported by its bound contract;
- snapshot schema/hash and config revision set.

It does not contain compiled request objects/bytes. Every retry reloads snapshot semantics and recompiles against the frozen provider contract/capability binding. If that binding is unavailable or revoked, retry blocks visibly; it never silently rebinds.

Snapshot creation and answer/operation/chosen/head are one DB transaction for every action. Missing snapshot on legacy answer means retry is unavailable; no provider/model-only fallback.

## Continuation model

Continuation is output state, not configuration:

| Contract | Required artifact |
|---|---|
| OpenRouter Chat | ordered `reasoning_details`, assistant tool calls, tool results, provider message identifiers where documented |
| OpenAI Responses | either stateful response/conversation id or complete client-managed response/reasoning/encrypted/tool/image items; modes are exclusive |
| Anthropic Messages | exact ordered thinking/signature/redacted/tool blocks |
| Gemini Interactions | interaction id plus native thought/tool steps as required by bound version |
| Gemini GenerateContent | candidate parts with thought signatures and tool calls |
| DeepSeek | assistant `reasoning_content` + tool calls for every tool subturn |
| LM Studio OpenResponses | complete ordered message/reasoning/function-call/output items returned by the qualified endpoint; `store:false`, no server-state ID |
| LM Studio OpenAI Chat Completions | complete ordered messages including assistant tool calls/reasoning fields and tool results; only when this fixed alternative is separately qualified |
| Other local protocols | only artifacts defined by the selected fixed protocol; no synthetic OpenAI normalization as storage truth |

Each artifact is contract-versioned, hashed, append-only by request sequence, and size-limited. Large encrypted/native payloads may use an epoch-owned blob reference. Visible text/reasoning projection is derived and cannot replace the native artifact.

## Data flow

```text
scope edits -> sparse GenerationConfigV2 revision
command -> resolve once -> capability bind -> preflight
        -> transaction(answer + operation + semantic snapshot + chosen/head)
runner -> load committed snapshot -> provider codec -> exact request
response decoder -> visible projections + provider continuation artifacts
next request -> provider codec consumes artifacts required by that contract
```

Retry copies the target snapshot value and attachment references to the new answer transaction. Regenerate resolves the current scope values at command submission. Neither path reads current UI during execution.

## Files and deletions

Add:

- `src/next/generation-v2/domain/generationConfigV2.ts`
- `src/next/generation-v2/config/resolveGenerationConfigV2.ts`
- `src/next/generation-v2/domain/assistantAnswerGenerationSnapshotV2.ts`
- `src/next/generation-v2/domain/providerContinuationArtifact.ts`
- DB repo/schema/IPC for the three fresh tables.

Delete:

- `reasoningPrefsScope.ts`, OpenRouter search/sampling/image persistence as config owners;
- Gemini thinking conversation meta owner;
- V1 snapshot type/table/IPC and all `requestPatch/requestParams` storage;
- provider/model-only and chosen/question fallback readers;
- `Record<string, unknown>` provider option persistence;
- synthetic provider-native continuation stored as generic visible messages.

## Exact examples

Semantic snapshot excerpt:

```json
{
  "schemaVersion": 2,
  "providerBinding": {
    "providerId": "google_ai_studio",
    "modelId": "gemini-3.1-flash-image",
    "protocol": "gemini_interactions_v1beta",
    "contractRevision": "2026-07-13"
  },
  "generation": {"temperature": 0.7, "maxOutputTokens": 4096},
  "reasoning": {"mode": "enabled", "effort": "medium", "summary": "auto"},
  "web": {"mode": "provider_search", "types": ["web", "image"]},
  "image": {"mode": "generate", "aspectRatio": "16:9", "sizeTier": "2K", "format": "jpeg"},
  "attachments": [{
    "assetId": "asset_1", "revision": 3, "sha256": "...", "include": true,
    "sendAs": "provider_file", "providerDescriptorRef": "filedesc_1"
  }]
}
```

DeepSeek continuation artifact excerpt:

```json
{
  "contract":"deepseek_chat_v4",
  "requestSequence":1,
  "kind":"assistant_tool_turn",
  "content":"I will query it.",
  "reasoning_content":"...",
  "tool_calls":[{"id":"call_1","type":"function","function":{"name":"weather","arguments":"{}"}}]
}
```

## Tests

- Schema validation, sparse inheritance, explicit-off versus omitted, deterministic merge/revision hash.
- Sensitive/runtime/unknown field rejection and extension union exhaustiveness.
- Snapshot transaction atomicity and immutable hash verification.
- Retry exact semantic copy after all current settings change; regenerate exact current revision.
- Legacy/missing/unsupported-version snapshot blocks without fallback.
- Attachment revision/hash/descriptor availability preflight.
- Exact continuation artifact round-trip for every protocol, including order/signatures/encrypted fields/tool ids.
- Snapshot/artifact size limit and epoch-owned blob integrity.
- Executor runs with no UI/session references.

## Acceptance

- One configuration table/model/resolver, one immutable snapshot format, one continuation-artifact abstraction with provider-native variants.
- Zero wire patch or unknown dictionary in semantic persistence.
- Every generated answer has its snapshot at the same transaction boundary as chosen/head.
- Every supported continuation can reconstruct the official next request; unsupported or missing artifacts block before transport.

## Risks and unresolved items

| Severity | Risk | Control / prerequisite |
|---|---|---|
| High | Contract evolves after snapshot | Freeze contract revision; require explicit migration policy for new generations, never reinterpret old snapshot silently. |
| High | Native artifacts contain large/opaque data | Epoch-owned blob references, hashes, quotas, and visible privacy disclosure. |
| High | Attachment asset mutates | Immutable revision/hash binding and preflight. |
| Blocker | OpenAI continuation mode | Owner must choose default stateful (`previous_response_id`/conversation) or client-managed items; never mix/fallback. |
| Fixed constraint | Gemini Developer API version | All Gemini contracts bind the provider-owned `v1beta` version while keeping GenerateContent, Interactions, and future Agents artifacts/codecs independent; no version fallback or model/operation version table exists. |
| Fixed constraint | LM Studio continuation | Qualified endpoints bind `lmstudio-openresponses`, persist/replay complete ordered Responses items, always send `store:false`, and never send `previous_response_id`; Chat Completions requires a repeatable Responses contract failure on a healthy runtime plus a separate explicit qualification, and is never runtime fallback. |

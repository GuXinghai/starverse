# TP5 — Compiler, ledger, request, transport, and retry

Verified 2026-07-13.

## Scope

Define the only semantic-to-wire compiler entry, exhaustive consumption ledger, immutable prepared request/bytes, pure transports, request-attempt/continuation sequencing, and the three committed generation actions.

## Current evidence

- No `GenerationFacade`, `PreparedProviderRequest`, runtime capability snapshot, or semantic consumption implementation exists on main/HEAD despite ADR 003.
- HEAD's generic writer (`src/next/generation-params/generationParamMappers.ts:9-43`), profile `wireKey/wirePath` (`generationParamTypes.ts:110-114`), and unknown-patch allowlist (`src/next/provider/providerGenerationParams.ts:1-22`) violate provider-native typing.
- Resolver warnings allow unsupported/deprecated/no-effect values to send (`generationParamResolver.ts:98-155`); tests at `generationParamResolver.test.ts:81-234` lock this old behavior.
- Providers serialize independently. HEAD Raw Debug's reusable invariant is that the captured serialized string is the fetch body (`runtimeProviderAdapter.ts:26-31`; `electron/debug/rawGenerationRequestStore.ts:45-72`), but operation/request sequence correlation is incomplete.
- OpenRouter transport rebuilds a lossy fallback body when bytes are absent (`electron/ipc/openRouterStreamBridge.ts:142-173,373-374`) and has renderer/main transport branches (`openRouterLiveStream.ts:619-653`).
- Compatible runtime has stable serialization and path-ownership diagnostics, but arbitrary `requestMappings.targetPath`/`extraBody` (`buildCompatibleChatRequest.ts:124-173`) is forbidden.
- SSE `retry:` is ignored and there is no operation attempt ledger (`openaiResponsesSseDecoder.ts:114`; `deepSeekSseDecoder.ts:107`).

## Compiler contract

```ts
compileGenerationV2({
  operation,
  snapshot,
  capability,
  continuationArtifacts,
  requestSequence
}): PreparedProviderRequestV2
```

Only the selected provider contract package may construct its native body. The core compiler validates binding/revisions, walks every explicit semantic leaf, delegates to the typed codec, verifies the exhaustive ledger, calls one deterministic serializer, hashes the exact bytes, and returns an immutable request.

```ts
type SemanticDisposition =
  | {kind:"consumed"; path:SemanticPath; nativeField:string; evidence:string}
  | {kind:"rejected"; path:SemanticPath; code:string; evidence:string}

type PreparedProviderRequestV2 = {
  operationId: string
  requestSequence: number
  attempt: number
  contractId: string
  endpoint: URL
  method: "POST"
  headersPlan: NonSecretHeaderPlan
  body: Uint8Array
  sha256: string
  ledger: SemanticDisposition[]
  capabilityRevision: string
  snapshotHash: string
}
```

There is no `ignored`, warning-and-send, deprecated-and-send, unknown, patch, or generic path disposition. Defaults omitted by the user need no semantic disposition; every explicit path must be consumed or compilation fails.

## Request and transport boundary

1. Provider codec returns a closed native request type.
2. Provider package serializer produces the only byte array.
3. The same byte array/hash is persisted in request ledger and offered non-fatally to Raw Debug.
4. Transport adds current credential/authorization and approved runtime headers without parsing or rebuilding the body.
5. Transport rejects absent/invalid bytes/hash/binding. No fallback request construction.

Raw Debug remains a separate DB, has no FK/transactional dependency, and capture failure never blocks sending. It receives the exact prepared bytes, operation id, request sequence, attempt, provider/model/endpoint metadata, and hash. It stores request bodies only, per the user's product decision.

## Operation/request/attempt ledger

```text
generation_operation_v2
  operation_id, kind, branch/question/target/result, status, terminal_error

generation_request_v2
  operation_id, request_sequence, contract_id, body_hash,
  snapshot_hash, capability_revision, status

generation_attempt_v2
  operation_id, request_sequence, attempt,
  started_at, ended_at, transport_status, http_status, error_code
```

- `operationId` is idempotent for the user action.
- `requestSequence` increments for provider-native tool/image/continuation subrequests.
- `attempt` increments only for an explicitly permitted transport retry of the same exact bytes.
- Terminal finalization is idempotent and never mutates chosen/head/hide.
- Startup converts claimed/in-progress V2 operations/requests to `failed/stream_interrupted` while preserving committed branch state.

## Retry action semantics

| Command | Scope/config | Commit effect |
|---|---|---|
| Regenerate | question/current semantic config | create sibling, choose/head new answer immediately, preserve old |
| Retry as new | current chosen answer/target snapshot | create sibling, choose/head new answer immediately, preserve target |
| Retry replace | current chosen answer/target snapshot | branch-local hide target, create replacement, choose/head replacement immediately |

All three commit before network. Completed, failed, cancelled, and interrupted keep the new answer chosen/head. A stale target or preflight/transaction failure creates nothing. Same operation id returns the same operation/result; different payload is rejected. Concurrent different operations for the same branch/question are transaction-conflicted.

Transport retry is distinct: it never creates an answer or changes branch projection. Default Goal 2 policy should be no automatic retry until each provider contract lists safe errors and idempotency guarantees. If enabled, it reuses identical bytes and adds a new attempt only.

## Files and deletions

Add:

- `src/next/generation-v2/compiler/compileGenerationV2.ts`
- `semanticConsumptionLedger.ts`, `preparedProviderRequestV2.ts`, `stableSerialize.ts`
- `src/next/generation-v2/runner/generationRunnerV2.ts`
- `infra/db/repo/generationLedgerV2Repo.ts`
- provider contract packages defined in TP6/TP7.

Delete:

- `generationParamMappers.ts`, `providerGenerationParams.ts`, profile wire fields;
- warning/no-effect resolver states and tests;
- `openRouterStreamBridge.buildFallbackRequestBody`;
- provider body reconstruction in transport and raw IPC bypasses;
- arbitrary compatible mapping/extraBody/unknown promotion;
- UI-generated native config/patches;
- old generation commands after V2 transaction parity.

## Exact prepared request example

```json
{
  "operationId":"op_01",
  "requestSequence":1,
  "attempt":1,
  "contractId":"openai_responses_v1",
  "bodySha256":"7746...",
  "snapshotHash":"a21b...",
  "capabilityRevision":"cap_42",
  "ledger":[
    {"kind":"consumed","path":"reasoning.effort","nativeField":"reasoning.effort","evidence":"openai-responses-2026-07-13"},
    {"kind":"consumed","path":"web.mode","nativeField":"tools[type=web_search]","evidence":"openai-web-search-2026-07-13"}
  ]
}
```

If `image.aspectRatio` is explicit for this OpenAI contract, compilation returns a typed rejection before a request row/transport attempt is created; it is not renamed to `size` or dropped.

## Tests

- Exhaustive semantic path ledger and compiler determinism/hash.
- Exact serialized bytes per provider fixture; Raw Debug bytes/hash equality and non-fatal failure.
- Transport cannot accept object body or rebuild/parse bytes.
- Zero unknown/patch/wire-path imports via architecture guard.
- Operation/request/attempt idempotency, concurrent conflict, repeated terminal events.
- Tool continuation increments request sequence; transport retry increments attempt with identical hash.
- All init/first-token/mid-stream/cancel/reload/process-interruption states persist terminal status and keep chosen/head.
- No orphan answer without operation/snapshot; no operation without answer.

## Acceptance

- One compiler entry and one runner; one provider-native codec/serializer per protocol.
- Every explicit semantic leaf is consumed or blocks; zero silent drop.
- Persisted bytes are exactly sent bytes and exactly Raw Debug bytes when capture succeeds.
- No transport fallback or protocol switching.
- User retry and network retry are distinct ledgers and cannot duplicate answers.

## Risks and prerequisites

| Severity | Risk | Control / prerequisite |
|---|---|---|
| P0 | Generic writer produces invalid Anthropic/DeepSeek thinking | Delete before V2 provider enablement. |
| P0 | Transport fallback silently loses semantics | Transport hard rejection and architecture guard. |
| High | Non-idempotent provider request auto-retried | Default no automatic retry; provider-specific Owner-approved matrix. |
| High | Raw capture accidentally serializes a copy | API accepts only `PreparedProviderRequestV2.body`. |
| Owner | Auto transport retry policy | Freeze per contract/error before enabling any attempt > 1. |
| Owner | Raw retention | User explicitly deferred deletion policy; no in-app policy is added. Direct DB deletion remains operational mechanism. |

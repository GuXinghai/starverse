# Static Review — Phase 4a: Main-Process Generation Runtime

**Status**: active
**Document Role**: closeout
**Last updated**: 2026-10-22

This is a read-only static review. The checkout was branch `codex/basic-operation-exploration-8q02ix` at `4058291`; that commit is the desktop WIP snapshot and contains only `world_map_experiment/__pycache__`. The application source matches baseline `aec217cd`, and the reports were added in `1a3fc3c`.

- No application code was modified.
- No tests, builds or native rebuilds were run.
- The app was not launched, and no provider requests were made.

## 1. Scope and coverage

| Area | Files | Depth |
|---|---|---|
| Shared runtime | `electron/services/generation{OperationRuntimeRegistry,RuntimeStarter,TimeoutPolicy,BodyCheckpoint,NativeCompletion,OrphanRecovery,StreamProjection,TextCommandResult}V2.ts`, `electron/net/providerHttpTransport.ts` (stream and abort), credential lease in `electron/credentials/epoch2RuntimeCredentialService.ts`, quit drain | Full |
| Anthropic | `anthropicGenerationV2Runtime.ts`, `anthropicMessagesStreamRunnerV2.ts`, `providers/anthropic/{chatStreamV1,nativeContentBlocksV1,toolContinuationContentV1}.ts`, native accumulator | Full; `anthropicNativeHistoryV2Repo.ts` about 25% |
| OpenAI Responses | runtime, stream runner, `providers/openai-responses/{responsesStreamV1,completionReceiptV1}.ts` | Full; `nativeItemsV1`, `continuationArtifactV2` and `terminalArtifactV1` not read |
| DeepSeek | runtime, `deepSeekInitialStreamRunnerV2.ts`, `providers/deepseek/{chatStreamV1,terminalArtifactV1}.ts` | Full; `nativeMessagesV1` not read |
| OpenRouter chat (carried over from 3b) | runtime, first-party runtime, stream runner, `providers/openrouter/chatStreamV1.ts`, `chatRequestV1.ts`, `openRouterChatPreparedRequestCompilerV2.ts` | Full; authority service about 30% |
| OpenRouter images | runtime, `openRouterImageInitialStreamRunnerV2.ts`, `providers/openrouter-images/imageStreamV1.ts` | Full; descriptor and endpoint-selection services not read |
| Gemini | GenerateContent and Interactions-image runtimes, runners, stream decoders, `interactionsTerminalArtifactV2.ts` | Full; request builders and native history not read (covered in 3b) |
| Compatible and local | OpenAI-compatible, Ollama, LM Studio and generic-local coordinators/runtimes/runners and stream assemblers, `localEndpointTransport.ts` | Runners and assemblers full; coordinators skimmed |

**Not covered (still open):**
- Plain-text and tool-continuation coordinators and snapshot-commit files for every provider.
- `interruptedReplayStorageV2`.
- `electron/net/electronManualRedirectFetch.ts`.
- LM Studio `nativeItemsV1` and `continuationArtifactV1`; OpenAI-compatible `nativeMessages*`.
- About 70% of `openRouterChatGenerationAuthorityV2Service.ts`.
- `operationSenders` cleanup in `textGenerationV2IpcCore.ts` (seen, not traced).
- All tests (supporting evidence only).

## 2. Subagent configuration and contributions

Two read-only `Explore` subagents ran with `model: sonnet` and `effort: high`. The tool accepts only a model family, so the exact "Sonnet 5.5" version cannot be confirmed. At most two ran concurrently, neither spawned agents, and neither wrote files.

The Phase 4a background agents from the local session failed when that session hit its usage limit. They were not resumed, and none of their partial output was available or used. This phase was re-run from scratch.

- **4A-A** covered the shared runtime, Anthropic, OpenAI Responses and DeepSeek: 14 candidates.
- **4A-B** covered OpenRouter chat and images, Gemini, and the compatible and local providers: 13 candidates.

The coordinator checked these against source:
- **P4a-01:**
  - The `fail()` helper builds the error with its default `receiptPersisted: true` (`generationNativeCompletionV2.ts:44-46, 53`).
  - The `insertReceiptWithRetry` path throws `receiptPersisted: false` (`:317-343`).
  - Each runner rethrows this error class (Anthropic `:419`, OpenAI `:535`, DeepSeek `:435`).
  - The registry returns early on the class alone (`generationOperationRuntimeRegistryV2.ts:234`).
- **P4a-02:**
  - `completedImages` checks run only in `finalize` (`openAIResponsesStreamRunnerV2.ts:102-123, 195`), not in the receipt validator (`:446-457`).
  - Retry budget is `[100, 500, 2000]` (`generationNativeCompletionV2.ts:431, 499`).
  - Orphan recovery skips pending receipts (`generationOrphanRecoveryV2.ts:165-166`).
- **P4a-03:** string assistant content at `generationInterruptedReplayV2Repo.ts:126`.
- **P4a-04:** the `this.#finish` guard at `generic-local-openai-chat/chatStreamV1.ts:48`, and `include_usage: true` at `chatRequestV1.ts:36`.
- **P4a-05:** per-chunk CRLF normalisation at `openrouter/chatStreamV1.ts:88` and `gemini/generateContentStreamV1.ts:160`. The empty first line fails at `openrouter/chatStreamV1.ts:118`.
- **P4a-17:** Gemini Interactions `submitInitial` drops `signal` (`geminiInteractionsImageGenerationV2Runtime.ts:43-54`), but the run itself uses the registry signal (`:39`).

## 3. Findings by severity

There are no High findings. Final IDs are P4a-NN, with agent IDs in brackets.

### Medium

#### P4a-01 — A failed receipt insert leaves the operation `streaming` with no Stop and no in-process recovery [4A-A-1]
- **Severity:** Medium. The branch stays locked and the user cannot cancel until the app restarts. It needs a SQLite failure or an oversize receipt, so it is rare.
- **Status:** Statically confirmed.
- **Where:**
  - `electron/services/generationNativeCompletionV2.ts:44-46` (`fail()` uses the constructor default `receiptPersisted: true`, `:53`) and `:317-343`.
  - Runner catch blocks rethrow the class: `anthropicMessagesStreamRunnerV2.ts:419`, `openAIResponsesStreamRunnerV2.ts:535`, `deepSeekInitialStreamRunnerV2.ts:435`.
  - `generationOperationRuntimeRegistryV2.ts:234` returns before the pending-receipt check at `:236`.
  - `.finally` clears `abort` at `:224-226`.
- **Trigger/path:**
  1. The provider completes.
  2. Persisting the receipt throws `receiptPersisted: false`, or an oversize check calls `fail()`.
  3. The runner rethrows.
  4. `#terminalizeUnhandledRunFailure` returns early.
  5. Nothing terminalizes the operation, and quit drain skips it.
  6. Only startup orphan recovery fixes it.
- **Repair direction:** In the registry, return early only when `receiptPersisted === true` and a pending receipt exists; otherwise terminalize as failed. Pass `receiptPersisted` explicitly in the size/shape `fail()` paths before the insert.
- **Verify:** A unit test that makes `insertPending` throw twice should expect the operation `failed` and the branch unlocked.

#### P4a-02 — No terminal state for a pending completion receipt that can never materialize [4A-A-2]
- **Severity:** Medium. The operation stays `streaming` indefinitely, across restarts, and the branch stays locked. The user cannot fix this.
- **Status:** Statically confirmed for the mechanism. The concrete trigger needs a provider output the request would rarely produce.
- **Where:**
  - Receipt states are only `pending` or `materialized` (`infra/db/repo/generationNativeCompletionReceiptV2Repo.ts:30`).
  - Retries are three per process (`generationNativeCompletionV2.ts:431, 499`).
  - Both orphan recovery (`generationOrphanRecoveryV2.ts:165-166`) and the registry fallback (`:236`) skip pending receipts.
- **Deterministic example:**
  - OpenAI `finalize` → `completedImages()` (`openAIResponsesStreamRunnerV2.ts:102-123, 195`) throws `RESPONSE_INVALID` for more than 10 images, bad base64, or a non-png/jpeg/webp signature.
  - The receipt validator (`:446-457`) never runs that check, so the receipt is stored and then fails on every attempt.
- **Repair direction:**
  - Run every deterministic `finalize` check inside `validate`, so a bad output becomes an ordinary failed outcome before the receipt is stored.
  - Add an `abandoned`/`failed` materialization state that terminalizes the operation as failed after N attempts across restarts.

#### P4a-03 — Anthropic replay fallback emits string assistant content; a crash-recovered Anthropic turn breaks later requests [4A-A-3; extends P3b-01]
- **Severity:** Medium. Every subsequent Anthropic request in that conversation fails deterministically, and the request fails closed.
- **Status:** Statically confirmed.
- **Where:**
  - `generationOrphanRecoveryV2.ts:345-356` terminalizes as failed, keeps the checkpointed body, and writes no interrupted-replay snapshot.
  - `infra/db/repo/generationInterruptedReplayV2Repo.ts:126` then produces `{ role: 'assistant', content: row.body }`.
  - `anthropicNativeHistoryV2Repo.ts:181-182` casts that without conversion.
  - `messagesRequestV1.ts:385-389` (`denseArray`, `:163-168`) rejects the string.
- **Relation to P3b-01:** P3b-01 already named `generationInterruptedReplayV2Repo.ts:126`. This phase adds the concrete runtime producers that reach it:
  - orphan recovery after a crash or kill;
  - any cancelled or failed turn whose snapshot capture threw (P4a-12);
  - pre-checkpoint legacy rows.
- **Drift:** OpenAI (`:119-123`) and Gemini build provider-shaped fallbacks. Anthropic and DeepSeek share the generic one, which is valid for DeepSeek.
- **Counterevidence:** A normal abort, error or quit captures a snapshot and does not hit this path.
- **Repair direction:** Emit `[{ type: 'text', text, citations: null }]` for Anthropic here and in portable `message()`.
- **Verify:** Feed an orphan-recovered Anthropic turn into the Anthropic compiler.

**Carry-over answer (citations on interrupted text):**
- No code normalises `citations`.
- `interruptedSnapshot()` (`providers/anthropic/chatStreamV1.ts:303-307`) returns the accumulator content. That content copies the wire `content_block_start` verbatim (`anthropicMessagesNativeContentAccumulator.ts:116-124`), and `text_delta` only appends text.
- The replay path `interruptedReplayV1.ts:51-61` passes blocks through unchanged. `decodeBlock` (`messagesRequestV1.ts:272-280`) requires `citations` to be null or an array.
- The completed-turn path has the same strictness (`nativeContentBlocksV1.ts:188`). If the wire ever omitted `citations`, completed turns would fail too.
- So this is a latent mismatch tied to the real wire shape, not a separate live defect. The live defect is the string fallback above.

#### P4a-04 — Generic local OpenAI chat fails streams that end with the standard usage chunk [4A-B-1]
- **Severity:** Medium; High if common local servers emit the chunk. Every generation against such a server would end `failed`.
- **Status:** Statically confirmed logic. The runtime trigger depends on server behaviour.
- **Where:**
  - `src/core/generation-v2/providers/generic-local-openai-chat/chatStreamV1.ts:48` throws `GENERATION_V2_GENERIC_LOCAL_STREAM_INVALID` for any chunk after `#finish` is set.
  - `chatRequestV1.ts:36` always sends `stream_options.include_usage: true`.
  - The OpenAI streaming convention puts the `choices: []` usage chunk after the `finish_reason` chunk, so the assembler's own usage branch (`:53-56`) is unreachable in that order.
- **Drift:** `openai-chat-compatible/chatResponseAssemblerV2.ts` and the OpenRouter assembler accept usage after finish.
- **Impact:** The text arrives, then the turn ends failed, with the text only in the interrupted checkpoint.
- **Counterevidence:** The only test fixture has no usage chunk. The target servers' behaviour was not verified.
- **Repair direction:** After finish, accept exactly one `choices: []` usage chunk; also read `usage` from choice chunks.
- **Verify:** An assembler test with a standard finish-then-usage sequence.

#### P4a-05 — SSE decoders corrupt framing when a CRLF straddles a read boundary [4A-B-2, 4A-A-10]
- **Severity:**
  - Gemini GenerateContent: Medium, as an intermittent mid-stream failure.
  - OpenRouter chat and OpenAI Responses: Low-Medium, latent and likely only behind CRLF-emitting proxies.
- **Status:** The logic is statically confirmed. Whether each server emits CRLF is a runtime assumption.
- **Where:** Each chunk is normalised independently with `.replace(/\r\n?|\n/g, '\n')`, at:
  - `providers/openrouter/chatStreamV1.ts:88` (and `:98`)
  - `providers/gemini/generateContentStreamV1.ts:160` (and `:172`)
  - `providers/openai-responses/responsesStreamV1.ts:207`
- **Trigger:**
  1. One chunk ends in `\r`, and the next begins with `\n` (or `\n\r\n`).
  2. That yields an extra `\n`, so the next frame begins with an empty line.
  3. The decoder rejects it (`openrouter/chatStreamV1.ts:118`, `..._SSE_INVALID`), or it causes `PREMATURE_EOF` at end of stream.
- **Not affected:**
  - Anthropic (`#trailingCr`), DeepSeek, Ollama and generic-local.
  - LM Studio and the Gemini Interactions decoders, which parse raw text.
- **Repair direction:** Carry a trailing `\r` into the next push, as the Anthropic decoder does.
- **Verify:** Decoder tests that split `\r\n\r\n` at every offset.

#### P4a-06 — Anthropic `citations_delta` is rejected, so a cited web-search answer may fail mid-stream [4A-A-4]
- **Severity:** Medium if the wire format is as assumed, because web search is an enabled tool.
- **Status:** Suspected. The real wire format was not checked.
- **Where:**
  - `providers/anthropic/chatStreamV1.ts:241` allows four delta types; anything else becomes `STREAM_INVALID_EVENT`.
  - Web search is compiled in at `anthropicMessagesPreparedRequestCompilerV2.ts:101-115`.
  - The legacy mapper handles `citations_delta` (`src/next/provider/anthropic/anthropicStreamMapper.ts:140`). The V2 fixture puts citations in `content_block_start` instead.
- **Repair direction:** Accept `citations_delta` and append the citation to the block's `citations` array.
- **Verify:** A recorded web-search stream fixture.

### Low-Medium

| ID | Finding | Status | Where | Repair direction |
|---|---|---|---|---|
| P4a-07 [4A-A-5] | Anthropic `pause_turn` is persisted as a completed turn. History rebuild then throws `HISTORY_INTEGRITY_INVALID` for that final turn, so same-provider follow-ups fail. Reached only with server tools or web search. | Confirmed | `anthropicMessagesStreamRunnerV2.ts:204-223`; `anthropicNativeHistoryV2Repo.ts:200` | Treat `pause_turn` as a continuation state, or fail explicitly |
| P4a-08 [4A-A-6, 4A-B-9] | The completion receipt is persisted before the final checkpoint flush in `finally`. `finalize`/recovery then writes the body from `message_body_v2`. If the last flush fails, or the process dies in between, the completed body can lack up to about 50 ms / 4 KB of text that the native artifact has. | Confirmed | Anthropic `:301` then `:306`, `finalize` `:211-218`; DeepSeek `:338` then `:342`, `:214-221`; OpenRouter chat `:350` then `:354`, `:251-254`. OpenAI (`terminal.visibleText`, `:258`) and the local runners are not affected | Derive the final body from the native terminal snapshot |
| P4a-09 [4A-B-3] | The OpenRouter Images SSE decoder rejects comment lines (`: keepalive`) and comment-only frames. It also requires `[DONE]` even after a provider `error` event. The chat decoder accepts both. | Confirmed (drift); whether OpenRouter sends keepalives on this endpoint is unverified | `providers/openrouter-images/imageStreamV1.ts:235-260` | Accept comments; treat an error event as terminal |
| P4a-10 [4A-B-4] | Gemini Interactions appends image data from separate `model_output` steps into one base64 buffer. The multi-image guard is per step only. Unpadded first segments can produce a valid-looking but corrupt blob. | Suspected | `providers/gemini/interactionsStreamV1.ts:667-673`, guard about `:343` | Fail on a second image-bearing step, or keep images separate |
| P4a-11 [4A-B-11] | OpenRouter `reasoning_details` deltas are stored as raw fragments, never merged by `index`. They are replayed together with `reasoning`. Annotations are not deduplicated. The provider may reject them on continuation. | Suspected (provider expectation unverified) | `providers/openrouter/chatStreamV1.ts:211-216` | Merge by `index` and type before persisting |

### Low

| ID | Finding | Status | Where |
|---|---|---|---|
| P4a-12 [4A-A-7] | `interruptedSnapshot()` is the first, unguarded statement in each runner's `finally`. If it throws, the rest of the cleanup is skipped and the original error is masked. Skipped cleanup: `checkpoint.flush`/`dispose`, `reader.cancel`/`releaseLock`. The checkpoint timer can then publish a body after the terminal event. The lost snapshot feeds P4a-03. A throw before the reader is wrapped also leaks the response body. | Confirmed | Anthropic `:305`, OpenAI `:430`, DeepSeek `:341`; `receive` setup Anthropic `:262-266` |
| P4a-13 [4A-A-8, 4A-B-7] | The registry never evicts `#entries` (`generationOperationRuntimeRegistryV2.ts:95`) and rehydrates all snapshots on each subscribe (`:127-137`). Copying the reasoning array per event is O(n²) (`:565-571`). One reasoning row per delta, capped at 65,536 (`answerReasoningProjectionV2Repo.ts:9`), then silently dropped. The checkpoint rewrites, double-encodes and republishes the whole body each flush. Decoders re-encode the whole pending buffer each push. | Confirmed (measure first) | as listed; `generationBodyCheckpointV2.ts:38-52`; `openrouter/chatStreamV1.ts:91`; `gemini/generateContentStreamV1.ts:163`; `anthropic/chatStreamV1.ts:97` |
| P4a-14 [4A-A-9, 4A-B-6] | Error-detail drift. Anthropic non-200 responses are cancelled unread, with no status, request id or Retry-After. All Anthropic decoder errors become `TRANSPORT_FAILED`, and mid-stream `event: error` becomes `STREAM_INVALID_EVENT`. Compatible, Ollama, LM Studio, generic-local and OpenRouter Images carry no HTTP status. These runners persist raw `Error.message` as both code and message (`openAIChatCompatibleStreamRunnerV2.ts:253`, `ollamaChatStreamRunnerV2.ts:325`, `genericLocalOpenAIChatStreamRunnerV2.ts:131`). Gemini's `GEMINI_RUNNER_TIMEOUT` branch is dead (`:378-380`). No secret leak found. | Confirmed | `anthropicMessagesStreamRunnerV2.ts:80-90, 252-258` |
| P4a-15 [4A-B-5] | Truncated or blocked finishes are recorded as success. OpenRouter accepts `finish_reason` `error`/`length`/`content_filter` when no `error` object is present. Gemini accepts `MAX_TOKENS`; a `SAFETY` or prompt block becomes an undiagnosed `PREMATURE_EOF`. LM Studio drops `incomplete_details`. Generic-local and Ollama do not inspect the reason. | Confirmed | `openrouter/chatStreamV1.ts:193-198`; `gemini/generateContentStreamV1.ts:315, 386-391` |
| P4a-16 [4A-A-10] | Further decoder drift. Pending-frame caps differ (64 / 24 / 8 MB). Anthropic and DeepSeek drop events parsed earlier in a chunk that later fails; OpenAI keeps them. OpenAI skips a whole frame starting with `:`, including any `data` lines in it. | Confirmed | `anthropic/chatStreamV1.ts:10`; `openai-responses/responsesStreamV1.ts:11, 215` |
| P4a-17 [4A-B-8] | Only OpenRouter chat and Gemini GenerateContent wrap `reader.read()` in `abortable()`. The others rely on the fetch signal erroring the body. Gemini Interactions `submitInitial`/`retry`/`regenerate`/`editResend` drop the submission `signal`, but the run uses the registry signal, so Stop still works. | Confirmed (drift) | `geminiInteractionsImageGenerationV2Runtime.ts:39, 43-54` |
| P4a-18 [4A-A-11] | `#terminalizeUnhandledRunFailure` can throw on a DB error inside a `void`ed `.catch`. Electron has no `unhandledRejection` handler, which matches the Phase 0 lead. | Suspected | `generationOperationRuntimeRegistryV2.ts:221-223` |
| P4a-19 [4A-A-12] | Quit/quiesce drain removes an operation only on a non-`awaiting_tool` terminal. An operation that ends `awaiting_tool` after the abort waits out the 5 s timeout and reports `SHUTDOWN_ABORT_TIMEOUT`. | Confirmed logic | `generationOperationRuntimeRegistryV2.ts:431-434` |
| P4a-20 [4A-B-12] | OpenRouter Images accepts any `image/*`, including `svg+xml`, without magic-byte sniffing. The same bytes under a different MIME raise `ASSET_CONFLICT` and abort terminalization. Gemini thought-image data is only length-checked before being placed in a `data:` URL. The OpenRouter attachment compile base64-encodes everything before the 20 MiB body cap applies. | Confirmed | `openrouter-images/imageStreamV1.ts:124-130`; `attachmentAssetV2Repo.ts:489` |

### Info
- **I4a-01:** There is no connect, idle or first-byte timeout, by design (`generationTimeoutPolicyV2.ts:4-9`). A half-open stream hangs until the user presses Stop; quit still aborts it.
- **I4a-02:** Quit aborts are recorded as `cancelled` / `user_cancelled` (`:53`).
- **I4a-03:** Credential lease hold time differs between providers. OpenRouter chat/images, Gemini Interactions and the A-group providers hold the lease for the whole stream; Gemini GenerateContent releases it after the headers. Key rotation during a stream was not traced.
- **I4a-04:** OpenAI persists image blobs before the finalize transaction (`openAIResponsesStreamRunnerV2.ts:197-200`). A failed transaction leaves orphan blobs (cf. Phase 2b blob lifecycle).
- **I4a-05:** The DeepSeek decode failure puts the offending chunk (`currentValue`) into the persisted failure fact (`deepseek/chatStreamV1.ts:163-168`). This is provider content, not a secret.
- **I4a-06:** DeepSeek's `phase` labels for non-200 vs 200 responses are the reverse of OpenAI's.
- **I4a-07:** Orphan recovery lets non-classified DB/I/O errors propagate out of `mainV2.ts:255` and block startup. The code comment (`generationOrphanRecoveryV2.ts:359-361`) says this is intentional; recorded as a design trade-off.
- **I4a-08:** The same body-schema prototype-key issue appeared again (4A-B-10). This is P3b-14, already recorded. The OpenRouter `skipPolicyRanges` behaviour corroborates P3b-02.
- **I4a-09:** `operationSenders` in `textGenerationV2IpcCore.ts` may keep entries for `idempotent_replay` and `awaiting_tool` operations. Not traced; carried to Phase 4b.

## 4. Uncertainties and excluded false positives

**Uncertainties:**
- Real Anthropic wire shape: whether `citations` is present at `content_block_start` and whether `citations_delta` occurs (P4a-03 carry-over, P4a-06).
- Whether local servers send the trailing usage chunk (P4a-04).
- CRLF framing per server (P4a-05).
- OpenRouter Images keepalives (P4a-09).
- OpenRouter `reasoning_details` merge expectations (P4a-11).
- Whether Electron `net.fetch` always errors a pending `read()` on abort (P4a-17).
- Electron's unhandled-rejection default (P4a-18).
- Whether failed or cancelled turns are included in context by default; this sets the frequency of P4a-03.

**Held up:**
- Terminal commit is one transaction across attempt, request, message, operation, artifact and interrupted row. The `status='streaming'` guards and `terminalizeAttempt` conflict handling prevent a double terminal. Cancel, timeout and completion races resolve cleanly.
- The total-timeout, checkpoint, drain and recovery-scheduler timers are cleared on every path. The recovery timer is `unref`'d.
- Abort reaches `fetch` in every runner, and the reader is cancelled in `finally`. Cancel-before-dispatch produces a `pre_stream` cancelled finalize.
- Credential leases are released in `finally` (`epoch2RuntimeCredentialService.ts:679-681, 721-725`), and `close()` awaits active leases.
- UTF-8 decoding uses fatal `TextDecoder` with `stream: true` and flushes at finish.
- Completion receipts are idempotent: payload comparison excludes the timestamp. Recovery checks `isProviderCompletionAlreadyPersisted`.
- The body checkpoint enforces a monotonic prefix with compare-and-set.
- Orphan recovery runs once before the registry, IPC and window exist, so it cannot misclassify a live operation. It runs one transaction per operation and preserves awaiting-tool state.
- `webContents.send` is guarded by `isDestroyed()` and try/catch.
- OpenAI and DeepSeek failures go through the redacting `createProviderFailureV2`.
- The OpenRouter mid-stream `error` object is detected first. Duplicate `[DONE]` and events after done are rejected. Tool-call counts are bounded.
- Ollama requires exactly one `done` row with a `done_reason`.
- Every runner uses `redirect: 'error'`.
- On a model or endpoint scope change, portable history drops opaque reasoning, so old native reasoning is not replayed to a new model.
- The OpenRouter request path uses own-descriptor reads. The compatible validator bans `__proto__`, `constructor` and `prototype`. The compatible body is capped at 2 MiB / 512 messages.
- Pre-`begin()` throws in the local runners are terminalized by the registry fallback.

**Rejected or downgraded:**
- "Orphan recovery can block startup" moved to Info (I4a-07), because it is intentional and documented.
- "Gemini Interactions cancel does not work" was rejected: the run receives the registry signal.
- "Interrupted Anthropic text missing `citations` is a live defect" was downgraded to a latent mismatch. Completed turns use the same blocks under the same check.

## 5. Next phase

**Phase 4b covers renderer conversation state:**
- `appChatApp.logic.ts` send/retry/edit orchestration
- projection subscriptions
- the `src/next/state` reducer and scheduler
- `useLiveStreamController`
- the branch cache
- I4a-09 (`operationSenders` lifetime)

The plain-text and tool-continuation coordinators left open here can be included in 4b or handled as a short 4a follow-up.

This phase is complete. I have stopped and am waiting for your instruction to continue.

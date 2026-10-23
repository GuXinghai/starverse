# Repair Phase 3: generation and protocol correctness

**Status**: active
**Document Role**: closeout
**Last updated**: 2026-10-23

This phase does R3-01 to R3-08 from [repair-plan.md](repair-plan.md) section 3. Every fix is covered by a test that names its finding ID.

- The Phase 1 `it.fails` tests for P3b-01, P4a-03, P4a-04 and P4a-05 are now ordinary tests. No assertion was weakened.
- No provider or network requests were made. Tests used in-memory databases and synthetic streams. The Electron smoke used an isolated, offline agent profile under the system temporary directory and a synthetic SSE endpoint served from the renderer origin.
- The owner constraint D-3 (no generation timeouts) holds: no deadline was added. Stop and quiesce settle streams through the abort signal only.

## 1. Scope and repository state

| Item | Value |
|---|---|
| Branch | `codex/static-review-repairs`, on top of `19e2f578` (fail-closed startup, D-4r) |
| Untouched working-tree content | `world_map_experiment/__pycache__/` (untracked, preserved, not committed) |
| Subagents | None in this phase; see section 7 |

## 2. Changes by item

### R3-01: Anthropic history uses block content; `pause_turn` is not a completed turn (P3b-01, P4a-03, P4a-07)

- `infra/db/repo/portableGenerationHistoryV2.ts`: for Anthropic, an assistant message is compiled as a content-block array (`[{ type: 'text', text, citations: null }, ...]`) instead of a bare string (P3b-01).
- `infra/db/repo/generationInterruptedReplayV2Repo.ts`: the Anthropic fallback for an interrupted answer emits the same block form (P4a-03).
- `electron/services/anthropicMessagesStreamRunnerV2.ts`: a stream that ends with `stop_reason: 'pause_turn'` is stored as failed with `GENERATION_V2_ANTHROPIC_PAUSE_TURN_UNSUPPORTED`, and no native history artifact is written (P4a-07). Continuing a paused turn needs server-tool continuation, which this app does not have.

### R3-02: one SSE line splitter for every decoder (P4a-05, P4a-09, P4a-16 in part)

- New `src/core/generation-v2/providers/sseLineEndingsV1.ts` (`SseLineEndingNormalizerV1`). It holds a trailing CR until the next chunk, so a CRLF split across two chunks is one line ending, and flushes it on `finish`.
- Used by the OpenRouter chat, Gemini generateContent, generic local chat and OpenAI Responses decoders.
- P4a-16: OpenAI Responses no longer drops a whole frame because its first line is a comment; a frame with only comments is skipped.
- P4a-09: OpenRouter images ignores comment lines and comment-only frames.

### R3-03: generic local streams accept the trailing usage chunk (P4a-04)

- `src/core/generation-v2/providers/generic-local-openai-chat/chatStreamV1.ts`: a chunk after `finish_reason` is accepted when it has no choices (the `include_usage: true` usage chunk). A chunk with choices after the finish is still rejected.

### R3-04: Anthropic `citations_delta` (P4a-06)

- The wire shape was established from Anthropic's published streaming documentation: a `content_block_delta` whose `delta` is `{ type: 'citations_delta', citation: {...} }`, adding one citation to the current text block. No live request was made.
- `src/core/generation-v2/providers/anthropic/chatStreamV1.ts` accepts the delta when `citation` is an object.
- `src/core/provider/anthropic/anthropicMessagesNativeContentAccumulator.ts` appends the citation to the current text block's `citations` (creating the array from `null`). A citation for a non-text block, or without a citation object, gives the diagnostic `invalid_citations_delta`.

### R3-05: incomplete finishes are not success; checkpoint before receipt; cleanup survives a throwing snapshot (P4a-15, P4a-08, P4a-12)

- New `electron/services/generationProviderFinishV2.ts`:
  - `GENERATION_V2_PROVIDER_OUTPUT_INCOMPLETE` for `length`, `max_tokens`, `MAX_TOKENS`, `insufficient_system_resource` and `error`.
  - `GENERATION_V2_PROVIDER_OUTPUT_BLOCKED` for `content_filter`, `refusal`, `SAFETY`, `RECITATION`, `BLOCKLIST`, `PROHIBITED_CONTENT`, `SPII` and `IMAGE_SAFETY`.
  - `settleProviderFinishV2` turns a `completed` state with such a finish reason into `failed` with that code (P4a-15, D-4).
- Wired at the start of the terminal step in the OpenRouter chat, DeepSeek, Gemini generateContent, generic local, OpenAI-compatible and Ollama runners. Anthropic maps its stop reason the same way.
- P4a-08: the Anthropic, DeepSeek, OpenRouter and Gemini runners flush the body checkpoint before persisting the completion receipt.
- P4a-12: in the same four runners, a throwing `interruptedSnapshot()` in `finally` is caught, so the original error is not masked and cleanup continues.

### R3-06: Stop reaches every runner's stream read (P4a-17)

- New `abortableGenerationReadV2(promise, signal)` in `electron/services/generationTimeoutPolicyV2.ts`. It rejects with the abort reason when the signal aborts, even if the read itself never settles.
- Used for the stream reads in the generic local, LM Studio, OpenAI-compatible, Ollama, OpenRouter image and Gemini interactions image runners. The other runners already raced their reads.

### R3-07: one regenerate or retry per click burst (P4b-01)

- `src/ui-app/app/appChatApp.logic.ts`: `onRegenerateFromQuestion` and `onRetryAnswer` claim the conversation in `answerActionConversationIds` before their first `await` and release it in `finally`. A second click while the first is in flight does nothing.

### R3-08: Stop never fails silently; stale "generating" is reconciled; `awaiting_tool` can be cancelled (P4b-03, P4b-04, P4a-19, P4b-12)

**Reachability of P4b-04.** The renderer always sends `tools: { mode: 'disabled' }`. A runner still ends `awaiting_tool` when the provider returns tool calls anyway: the OpenRouter runner, for example, sets `awaiting_tool` whenever the completed assistant message has `tool_calls`, and startup recovery keeps such an operation `streaming`. So the state is reachable through provider behaviour, not through the app's own request. No tool-continuation UI was needed for this repair: the operation is ended as cancelled, which matches what the user asked for by pressing Stop.

Main process (`electron/services/generationOperationRuntimeRegistryV2.ts`):

- `abort(operationId)`: when no runner is live, it now ends an operation left awaiting a tool result as `cancelled` (`user_cancelled`), terminalises its answer and publishes the terminal. It only does so when the operation is `streaming`, has a completed request, no prepared or streaming request, no open attempt, no pending completion receipt, and a streaming answer. Anything else is left to its own owner and `abort` returns `false`. Requests, attempts and artifacts are kept (P4b-04).
- Branch, conversation and project quiesce first cancel any operation in that scope that is left awaiting a tool result, including ones from a previous run that have no runtime entry. Deletion is no longer blocked by them (P4b-04).
- The quiesce and shutdown drain treats an `awaiting_tool` terminal that arrives after the abort as a reason to cancel the operation (after the event has reached every listener), rather than waiting out the timeout (P4a-19).

Renderer:

- `abortGenerationV2` unwraps the runtime result and returns whether the abort was accepted (`src/next/generation-v2/renderer/generationV2CommandClient.ts`).
- `onAbort` goes through `stopAndReconcile`: a refused or failed abort, or a failed refresh, is shown as the chat error (`GENERATION_V2_RUNTIME_ABORT_NOT_ACCEPTED` for a refused abort) unless the refreshed branch is no longer generating (P4b-03 path 3).
- A branch read whose answer is terminal drops a cached "generating" runtime snapshot for that operation (`BranchRuntimeCacheV2.settleStaleGenerating`), so a lost terminal event cannot keep the branch generating (P4b-03).
- The runtime-triggered refresh is scheduled per branch and its rejection is caught; a stale-projection rejection after a switch is ignored and anything else is shown (P4b-03 path 2, P4b-12).
- The error-path refresh in regenerate and retry runs only when the source branch is still active, and cannot throw out of the `catch` (P4b-12).

P4b-03 path 1 (`#persistedPayload` throwing on a terminal) is still untraced. The reconcile above covers its effect whenever the branch is next read.

## 3. Tests added or changed

| File | Finding IDs | Change |
|---|---|---|
| `infra/db/repo/portableGenerationHistoryV2.test.ts` | P3b-01, P4a-03 | Two `it.fails` → `it` |
| `infra/db/repo/anthropicNativeHistoryV2Repo.test.ts` | P4a-07 | A `pause_turn` terminal is stored as failed with the pause code and no native artifact |
| `src/next/generation-v2/providers/sseChunkBoundary.regression.test.ts` | P4a-05, P4a-09, P4a-16 | Four `it.fails` → `it`. Added: identical output for every two-chunk split of each case; normaliser, comment-frame (P4a-16) and image comment-line (P4a-09) tests |
| `src/next/generation-v2/providers/generic-local-openai-chat/chatStreamV1.regression.test.ts` | P4a-04 | `it.fails` → `it` |
| `src/next/generation-v2/providers/anthropic/chatStreamV1.test.ts` | P4a-06 | Two tests built from the documented `citations_delta` shape: accepted and accumulated; rejected without a citation object |
| `electron/services/generationProviderFinishV2.test.ts` (new) | P4a-15 | Finish-reason classification and settlement |
| `electron/services/openRouterChatStreamRunnerV2.integration.test.ts` | P4a-08, P4a-12, P4a-15 | A throwing checkpoint flush stops the receipt; a throwing interrupted snapshot does not mask the error and the reader is cancelled; `length` ends as failed with the incomplete code. All three failed against the pre-fix runner |
| `electron/services/generationTimeoutPolicyV2.test.ts` | P4a-17 | Source scan: no runner awaits a bare `reader.read()`; the helper rejects a stalled read on abort |
| `electron/services/openAIChatCompatibleGenerationV2Coordinator.test.ts` | P4a-17 | Stop settles a stalled stream body (one chunk, then silence, ignoring the fetch signal) as cancelled |
| `electron/services/generationOperationRuntimeRegistryV2.test.ts` | P4b-04, P4a-19 | Stop cancels an awaiting-tool operation and releases its branch; Stop leaves prepared, streaming and unknown operations alone; conversation quiesce cancels an awaiting-tool operation with no runtime entry; shutdown drains a runner that ends awaiting a tool after the abort |
| `src/ui-app/AppChatApp.regenRetry.test.ts` | P4b-01, P4b-03 | A second regenerate or retry click while the first is in flight submits nothing; a refused abort shows `GENERATION_V2_RUNTIME_ABORT_NOT_ACCEPTED`; a branch read showing the answer terminal clears a stale "generating" state |
| `src/ui-app/AppChatApp.scopeOwnership.test.ts` | P4b-01 | **Changed assertion.** The test "does not let an older same-page regenerate failure overwrite a newer action" submitted a second regenerate on the same question while the first was in flight, which is the P4b-01 defect. It now asserts that the second click submits nothing and the first failure is shown. Its old concern, a stale error overwriting a newer action's state, can no longer arise for two regenerates on one page |

Mutation checks: each of these was run against a reverted fix, failed for the stated reason, and passed after restore:
- `pause_turn` handling;
- the line-ending normaliser (9 tests failed);
- `citations_delta`;
- the OpenRouter finish settlement;
- the P4b-01 guard;
- the stalled-stream read in the OpenAI-compatible runner;
- the registry's awaiting-tool cancel (3 tests failed);
- the renderer's reconcile and Stop feedback (2 tests failed).

## 4. Checks run

| Check | Result |
|---|---|
| Touched test files, each run on its own | Pass, apart from failures that are in the baseline lists (below) |
| `npx vue-tsc --noEmit` | Pass |
| `node scripts/check-test-partitions.mjs` | Pass: unit 363, ui 91, integration 218 owners |
| ESLint on changed files | 0 errors. 120 warnings (function length and complexity), in pre-existing long functions |
| Unit partition | 10 failed, 3196 passed. Same 10 names as the R2-06 baseline |
| UI partition | 19 failed, 743 passed. 18 are the R2-06 baseline. The 19th was `AppChatApp.scopeOwnership.test.ts` "does not let an older same-page regenerate failure overwrite a newer action", which asserted the P4b-01 defect; its assertion was changed (section 3) and it passes. The partition was not rerun after that change |
| Integration partition | 37 failed, 1739 passed (R2-06 baseline 38). Three baseline names now pass. Two names are not in the R2-06 list: `geminiThinkingSendV2.test.ts` "proves actual V2 function declarations..." and `generationV2SearchTargetRepo.test.ts` "opens actual indexed old question and answer hits...". Both are 5 s timeouts in files this phase does not touch, both are in the Phase 1 baseline list, and both also time out when their files run alone. They are treated as load-related baseline timeouts |
| Baseline provider failures | `openAIChatCompatibleGenerationV2Coordinator.test.ts` keeps its three baseline failures; the new P4a-17 test in that file passes |

**Electron smoke.** Run after `npm run rebuild:electron` and a development build (`npx vite build --mode development`):
- One fresh, isolated agent profile (`SV_AGENT_ISOLATED_PROFILE=1`, `SV_AGENT_NETWORK=offline`) under `%TEMP%\sv-p3-smoke`.
- The renderer was served by the renderer-smoke Vite config plus a temporary middleware that answers `POST /v1/chat/completions` with synthetic SSE on the same origin. Offline mode allows only the renderer origin, so no other host could be reached. At startup the models.dev and cloud-rules fetches were blocked by offline mode (`MODELS_DEV_OFFICIAL_FETCH_FAILED`, `CLOUD_RULES_FETCH_FAILED`); no other request was made.
- The driver created a generic local endpoint profile pointing at that origin, resolved its capability revision and submitted through the real `genericLocal.openAIChatCompletions.initial` bridge.

| Scenario | Synthetic stream | Result |
|---|---|---|
| Completion (R3-02, R3-03) | CRLF frames, written in pieces cut between CR and LF; a usage chunk with `choices: []` after `finish_reason: 'stop'`; `[DONE]` | Terminal `completed`; the stored answer is `completed` with body "Hello from the synthetic server" |
| Stop on a stalled body (R3-06) | One content frame, then the body never ends | `runtime.abort` returned `aborted: true`; terminal `cancelled` (`user_cancelled`) 871 ms after Stop; the server saw the connection close; the stored answer is `cancelled`. A second abort returned `aborted: false` |
| History compile | The stalled request was the second turn | The provider received 3 messages (the first question, its compiled answer and the new question) |

The temporary Vite config, driver and profile were outside the repository, and the profile was deleted afterwards.

## 5. Limitations

- **Anthropic history compile was not smoked in Electron.** It needs an Anthropic endpoint, and offline mode allows only the renderer origin. It is covered by the portable-history and interrupted-replay tests, which compile mixed-provider history for Anthropic.
- **No runtime control run.** The smoke was not repeated on the pre-fix build. Pre-fix behaviour is shown by the flipped `it.fails` tests and the mutation checks.
- **Per-provider finish wiring** (R3-05) is tested end to end only for OpenRouter and Anthropic. The other runners share the same helper, but their wiring is checked only by reading the code.
- **Finish reasons not covered by R3-05:**
  - OpenAI Responses refusal output is still recorded as completed. Whether a refusal is a failure is a policy question.
  - LM Studio `incomplete_details` is still dropped.
  - A Gemini `SAFETY` finish with no parts is still reported as a premature end of stream rather than as blocked.
- **P4a-09:** OpenRouter images still requires `[DONE]` after an error event.
- **Anthropic's own line splitter** (`#append`) was not switched to the shared normaliser. It already handles CR/LF across chunks, and was left alone to keep the diff minimal.
- **Stored `pause_turn` rows.** Turns stored as completed `pause_turn` before this fix are not rewritten and can still break history rebuild for that conversation.
- **New error codes have no localised text** in the renderer: `GENERATION_V2_PROVIDER_OUTPUT_INCOMPLETE`, `GENERATION_V2_PROVIDER_OUTPUT_BLOCKED`, `GENERATION_V2_ANTHROPIC_PAUSE_TURN_UNSUPPORTED`, `GENERATION_V2_RUNTIME_ABORT_NOT_ACCEPTED`. They are shown as codes, as other generation errors are.
- **Abort wiring.** For the local runners other than OpenAI-compatible, abort wiring is shown by the source scan and the shared helper's test, plus the generic-local smoke.
- **R3-07** guards by conversation, which is stricter than the plan's "keyed by target": while a regenerate or retry is in flight, a second regenerate or retry anywhere in that conversation is ignored. Generation already holds one operation per branch.
- **R3-08:**
  - A Stop that lands in the few microtasks between a runner publishing `awaiting_tool` and its runtime entry being released is accepted by the dead controller and does nothing. The next Stop cancels the operation.
  - Startup recovery still keeps a valid awaiting-tool operation `streaming`. It is cancelled only on Stop or when its scope is quiesced.
  - Cancelling an awaiting-tool operation keeps its tool-call history artifacts. The answer is cancelled, so that history is not offered as a completed turn. Whether a later turn compiles cleanly for every provider after such a cancel was not tested.
  - P4b-03 path 1 (`#persistedPayload` throwing) is still untraced.

## 6. Deferred work and open questions

- Not in Phase 3, as planned: P4a-10, P4a-11, P3b-09, P3b-10 and P3b-11. These are provider-tolerance questions that need real providers, and they remain unverified.
- Policy question: should OpenAI Responses refusals and Gemini safety stops with no parts be recorded as blocked (R3-05 limitation)?
- Optional cleanup: localised text for the new error codes; rewriting stored `pause_turn` rows; LM Studio `incomplete_details`.
- The R2-06 follow-ups R2-06a to R2-06e stay tracked separately in [repair-plan.md](repair-plan.md): retry verification, raw storage error handling and misleading generating indicators.
- The baseline failures from Phase 1 remain, so CI is still red independently of these repairs.

## 7. Subagents

No subagents were used in this phase. The coordinator did the mapping, implementation, testing and conclusions directly.

## 8. Native module report

- better-sqlite3 ABI mismatch encountered: no
- Rebuild command run: `npm run rebuild:electron` (before the Electron smoke). All Node/Vitest runs used the Node ABI that was already active before it
- Current ABI target after task: electron
- Tests retried after rebuild: none needed
- Electron smoke retried after rebuild: no retry needed; the smoke ran once, after the Electron rebuild, and passed
- No native artifacts committed: confirmed

## 9. Next phase

Repair Phase 4 (effective-rule refresh and configuration consistency, D-6) in [repair-plan.md](repair-plan.md). It depends on Phase 3 because R3-07 and R3-08 touch the same send paths. The R2-06 follow-ups R2-06a to R2-06e stay tracked separately in the plan.

# Static Review — Phase 3b: Request Compilation

**Status**: active
**Document Role**: closeout
**Last updated**: 2026-10-22

Read-only static review. Working tree at branch `codex/basic-operation-exploration`, HEAD `aec217cd`, including uncommitted state. No application code modified, no tests/builds/rebuilds run, app not launched, no provider or network requests.

## 1. Scope and coverage

| Area | Files | Depth |
|---|---|---|
| Compiler core | `src/core/generation-v2/compiler/**` (prepared request, effective plan, adaptation, resolved invocation, consumption ledger, compatible intent, attachment transport, stableSerialize) | Full except `portableHistoryReasoningClassifierV2`, `generationAttachmentTransportPolicyV2` |
| Config and intent | `src/core/generation-v2/config/**`, `domain/{generationIntentV2, resolvedGenerationIntentV2, capabilityBoundGenerationCommandV2, providerBindingV2, generationOperationBindingV2}` | Full; `generationIntentProjectionV2`, `commandAttachmentsV2`, `identityV2` not read |
| Contracts | `src/core/generation-v2/contracts/**` incl. body schemas | Full |
| Rule operations | `capability-rules/operations/{requestedParametersV2, anthropicReasoningV2, toolDefinitionsV2}`, `requestRuleResolverV2`, `requestFactOverlayV2` | Full; OpenAI/Gemini reasoning ops and rule preview not read |
| Validators, capacity, tools | `infra/generation-v2/*`, `capacity/generationCapacityV1.ts`, `tools/toolRegistryV2.ts`, `generationToolRegistryAuthorityV2.ts` | Full |
| Renderer entry | `electron/ipc/generationV2ComposerIpc.ts`, `generationV2IpcRegistration.ts` | Full |
| Per-provider compilers | `electron/services/{anthropicMessages, openAIResponses, openRouterImage, geminiGenerateContent, deepSeekInitial, openAIChatCompatible, ollamaChat, lmStudioOpenResponses, genericLocalOpenAIChat}PreparedRequestCompilerV2.ts` and their `src/core/generation-v2/providers/*/` request builders and native-history projections | Full |
| History | `infra/db/repo/portableGenerationHistoryV2.ts`, `generationInterruptedReplayV2Repo.ts`, Gemini/Ollama/compatible/Anthropic native-history repos, `openAICompatibleV2Repo.ts`, `localEndpointProfileV2Repo.ts` | Request-relevant parts |

**Not covered:** OpenRouter **chat** compiler and `openrouter/chatRequestV1.ts` (not reached in the window — carry to Phase 4a or a follow-up); Gemini interactions-image compiler; OpenRouter image descriptor authority/selection; authority services for Gemini, DeepSeek, OpenRouter chat, OpenAI Responses; LM Studio native items/continuation; generic-local and LM Studio history repos. Stream parsers and runtimes are Phase 4a.

## 2. Subagent configuration and contributions

Two read-only subagents, `model: sonnet`, `effort: high` (exact "Sonnet 5.5" not confirmable), max two concurrent, no nested agents, no files written, nothing backgrounded.

- **3b-A** — provider-independent core: 13 candidate findings.
- **3b-B** — per-provider request builders: 9 findings plus Info.
- Coordinator verification against source: P3b-01 (`portableGenerationHistoryV2.ts:126-137` returns string assistant content for `anthropic` when there are no parts; `anthropicNativeHistoryV2Repo.ts:243` casts the result to Anthropic message types without conversion; `messagesRequestV1.ts:375-393` requires an array for assistant content; same shape in `generationInterruptedReplayV2Repo.ts:126`), P3b-02 (`skipNumericPolicy = bodySchemaRevision !== undefined` at `messagesRequestV1.ts:528`; `semanticCapabilityValidatorV2.ts` returns early for v2 plans with a resolution), P3b-09 (`apiRequestBodySchemaV2.ts:137` uses `schema.properties[key]` without an own-property check), P3b-08 (`generationV2ComposerIpc.ts:144, 162`).

## 3. Findings by severity

No High findings. Final IDs P3b-NN; agent IDs in brackets.

### Medium

#### P3b-01 — Switching a conversation into an Anthropic model fails to encode history [3B-B-1]
- **Severity:** Medium. A core user flow (change model mid-conversation, or replay an interrupted turn) fails deterministically for one major provider; fails closed, no data loss.
- **Status:** Statically confirmed (high confidence); confirm with a unit test.
- **Where:** `infra/db/repo/portableGenerationHistoryV2.ts:126-137` `message()` — for target `anthropic` with no extra parts it falls through to the generic `{ role, content: string }`; `infra/db/repo/anthropicNativeHistoryV2Repo.ts:243` casts the portable result to `AnthropicMessagesRequestMessageV1[]`; `src/core/generation-v2/providers/anthropic/messagesRequestV1.ts:375-393` `decodeMessages` — `assistant` content must be a dense array of blocks; `infra/db/repo/generationInterruptedReplayV2Repo.ts:126` produces the same string shape for the legacy interrupted-replay fallback.
- **Trigger/path:** A conversation with prior non-Anthropic (or non-native) assistant turns → user selects an Anthropic model → native history path returns null → portable history → string assistant content → request decoder throws `INVALID_SHAPE`.
- **Expected vs observed:** Expected a valid Anthropic history (`[{ type: 'text', text, citations: [] }]` — `decodeBlock` appears to require `citations`). Observed a guaranteed compile failure.
- **Counterevidence:** Pure Anthropic conversations use the native artifact path and never hit `message()`; user-role string content is accepted, so only assistant turns fail.
- **Repair direction:** Emit block arrays for Anthropic assistant messages in both builders. **Verify:** unit tests feeding portable and interrupted histories with an assistant turn into the Anthropic request compiler.

#### P3b-02 — Numeric and cross-field request invariants are not enforced for current (v2) requests [3B-A-1, 3B-A-4]
- **Severity:** Medium. Invalid bodies reach providers and fail as provider 400s; widened by fabricated catalog limits (P3a-12).
- **Status:** Statically confirmed.
- **Where:** `messagesRequestV1.ts:528` (`skipNumericPolicy = bodySchemaRevision !== undefined`) disables the checks at `:328, :449-456` (e.g. `budget_tokens >= 1024 && < max_tokens`); `src/core/generation-v2/contracts/apiRequestBodySchemaV2.ts` and `body-schemas/*` are structural (safe integers, no minima); `infra/generation-v2/semanticCapabilityValidatorV2.ts:22-31` returns early for v2 plans; `resolvedCapabilityV2.ts:384-423` skips domain checks for `unknown` fields; `anthropicReasoningV2.ts` clamps the manual budget to its own domain without cross-checking `max_tokens`. `activeCatalogModelAuthorityV2Service.ts:100-215` fabricates 1,000,000 output limits that become the accepted domain (`anthropicGenerationAuthorityV2Service.ts:164`, `geminiGenerateContentGenerationAuthorityV2Service.ts:137`, `openAIResponsesGenerationAuthorityV2Service.ts:323`).
- **Trigger:** A capability field in state `unknown`, or a wrong/fabricated fact; user sets `max_tokens`/budget/top_k outside the real provider range.
- **Expected vs observed:** Expected a hard local floor for provider invariants. Observed: only the capability domain applies, and for unknown/fabricated facts that domain is wide.
- **Counterevidence:** The fabricated 1,000,000 is not sent by default — compilers emit `max_tokens` only when set; when both facts exist the projection builds `budget <= outputMax - 1`.
- **Repair direction:** Keep codec numeric invariants as an unconditional floor; return `unknown` instead of fabricated catalog limits. **Verify:** compile tests with `unknown` capability fields and out-of-range values.

#### P3b-03 — Unencodable attachments and unsupported parameters are dropped silently [3B-A-2]
- **Severity:** Medium. The user receives an answer produced without the file or setting they believe was applied.
- **Status:** Statically confirmed for the drop; renderer surfacing not found (search not exhaustive).
- **Where:** `src/core/generation-v2/compiler/compatibleGenerationIntentV2.ts:206-243` and `requestAttachmentTransportV2.ts` (`target_attachment_encoding_unavailable`, request proceeds); `requestRuleResolverV2.ts` ~299-305 (`defer` mode deletes params, records `rule_target_parameter_unavailable`); `requestedParametersV2.ts:507-514` (web search prompt always deferred); `semanticConsumptionLedgerV2.ts` (only `consumed` kind — drops appear as `accepted_no_wire`); `requestAdaptationV2.ts` keyed by `compatibility.${path}` (duplicate paths overwrite). Only consumer found: `infra/db/repo/generationCommandFactsAuthorityV2.ts` ~120-205. Provider-level instance: DeepSeek compiler `accept()` (P3b-12).
- **Repair direction:** Surface adaptation decisions in the answer snapshot/UI; add a `dropped` ledger kind or fail when an included attachment is dropped; key adaptations by path+operation. **Verify:** end-to-end test with an unsupported included attachment expecting a visible notice.

#### P3b-04 — No context-window budgeting; capacity is bytes-only [3B-A-5]
- **Severity:** Medium (reliability). Long conversations fail at the provider instead of being trimmed or rejected locally with a clear message.
- **Status:** Statically confirmed.
- **Where:** `src/core/generation-v2/capacity/generationCapacityV1.ts` (20/24/28 MiB body caps); `portableGenerationHistoryV2.ts` strips media only over a byte budget and never truncates text; `compatibleGenerationIntentV2.ts` attachment budget counts attachment bytes + 4 KiB reserve, not history/text. Nothing compares estimated input to `inputTokenLimit`.
- **Repair direction:** Conservative token estimate against a known `inputTokenLimit`, with a user-visible rejection or truncation policy; include history/text in the attachment budget.

### Low-Medium

| ID | Finding | Status | Where | Repair direction |
|---|---|---|---|---|
| P3b-05 [3B-A-12] | Composer IPC memory/disk hazards: `import-local` reads the whole file with no size check (`readFile` at :144, outside the `try`, so a throw leaks the opaque staging dir); `import-url-file` buffers `arrayBuffer()` before the 50 MiB check; `read-preview` returns full images as base64 with no cap; `draftText` uncapped; blob persisted before the DB transaction (orphan on revision conflict). | Confirmed | `electron/ipc/generationV2ComposerIpc.ts:126-227` | `stat` first and streaming caps; cap `draftText`; outer `try/finally` |
| P3b-06 [3B-A-12] | Opaque import cleanup does `rm(path.dirname(filePath), { recursive: true, force: true })`. Safe today (only caller stages into a dedicated dir, `packagedTestDocxFixtureAuthorityV1.ts:84`), but any future opaque-grant caller pointing at a real user directory would have that directory deleted. | Confirmed (latent) | `generationV2ComposerIpc.ts:162` | Bind cleanup to a staging-root check, or have the grant carry its own cleanup handle |
| P3b-07 [3B-A-3] | `unsupported: 'preserve'` keeps values whose field is unsupported/conflict/missing or out of domain, and skips the temperature guard; only coverage is required. No shipped rule data found using it. | Suspected | `requestRuleResolverV2.ts:294-297` | Still reject `conflict`/`unsupported`; distinct adaptation entry |
| P3b-08 [3B-B-2] | Cross-provider (portable) history flattens tool results and citations to unbounded plain text. | Confirmed | `portableGenerationHistoryV2.ts:308-329` | Truncate/label quoted tool output |
| P3b-09 [3B-B-5] | DeepSeek replays `reasoning_content` from all prior turns; `generatedWithThinking` is stored but unused by the request builder. | Suspected (provider tolerance unverified) | `providers/deepseek/nativeMessagesV1.ts` build functions | Keep reasoning only where the API requires it |
| P3b-10 [3B-B-3] | LM Studio ledger records `reasoning` as encoded whenever mode is enabled, but the wire field is emitted only with an effort → late opaque `LEDGER_FIELD_MISSING`. | Suspected (resolver default unverified) | `lmStudioOpenResponsesPreparedRequestCompilerV2.ts` ~98-100; `preparedProviderRequestV2.ts:645-669` | Capability `requires_value`, or conditional ledger entry |
| P3b-11 [3B-B-4] | Registry tool schemas passed raw to Gemini (OpenAPI subset) and DeepSeek; Gemini name grammar narrower than registry; `googleSearch` + `functionDeclarations` combination unverified. | Suspected (runtime) | Gemini/DeepSeek compilers; `toolDefinitionsV2.ts:10` | Per-provider schema projection and validation |

### Low

| ID | Finding | Status | Where |
|---|---|---|---|
| P3b-12 [3B-B-7] | DeepSeek compiler accepts-and-drops web/image modes, topK/minP/topA/seed/candidateCount/repetitionPenalty and foreign extensions, relying wholly on the capability validator. | Confirmed | `deepSeekInitialPreparedRequestCompilerV2.ts` `accept()` |
| P3b-13 [3B-B-6] | Image admission looser than providers: Anthropic `startsWith('image/')` (accepts svg/bmp/tiff); Gemini 4 MiB inline cap only on `provider_file`. Third image-MIME rule elsewhere → drift. | Suspected | `anthropicMessagesPreparedRequestCompilerV2.ts:152`; `geminiGenerateContentPreparedRequestCompilerV2.ts:66-95` |
| P3b-14 [3B-A-6] | Body-schema validator reads `schema.properties[key]` without own-property check; `__proto__`/`constructor`/`toString` keys bypass `additionalProperties: false`. No producer found. | Confirmed (latent) | `apiRequestBodySchemaV2.ts:137` |
| P3b-15 [3B-A-8] | Tool registry `cloneJson` assigns `output[key]` → own `__proto__` key in a parameters schema changes the prototype and vanishes from the digest; no JSON-Schema or strict-mode validation; whole registry re-parsed/re-hashed per selection. | Confirmed | `toolRegistryV2.ts:62`; `toolDefinitionsV2.ts:91, 136-138` |
| P3b-16 [3B-A-7] | Intent decoder inconsistencies: `maxOutputTokens` 0 accepted in sampling but ≥1 in requested parameters; `stop`, `candidateCount`, `allowedToolIds`, attachment lists uncapped. | Confirmed | `domain/generationIntentV2.ts:435-479, 527` |
| P3b-17 [3B-B-8, 3B-B-9] | Late/opaque failures and ledger gaps: Ollama enabled-effort without value fails at compile time; OpenRouter image `aspectRatio: 'auto'` unrecorded, `image.stream` recorded but not value-asserted, non-disabled tools/web/reasoning neither recorded nor rejected; narrow URL-only fallback may miss `adapted()` routing. | Suspected | `ollamaChatPreparedRequestCompilerV2.ts`; `openRouterImagePreparedRequestCompilerV2.ts:103-114`; `portableGenerationHistoryV2.ts:164-165, 513-515` |
| P3b-18 [3B-A-9] | Duplicated logic: `requestAttachmentTransportV2.ts` ≈ copy of `compatibleGenerationIntentV2.ts:174-243` (both live); codecs hard-code 20/24/28 MiB instead of importing capacity constants; three tool-name rules and three image-MIME rules. | Confirmed | as listed |
| P3b-19 [3B-A-10] | Pure-JS SHA-256 re-hashes bodies up to 28 MB on every brand check; several parses per issue; `TextEncoder` per append in canonical JSON. | Confirmed (measure first) | `preparedProviderRequestV2.ts`; `canonicalJsonV2` |
| P3b-20 [3B-A-11] | `localeCompare(…, 'en')` ordering inside a hashed adaptation ledger (ICU-dependent); module-global `activeScope` safe only while callers stay synchronous. | Confirmed | `requestAdaptationV2.ts:62-67` |

### Info
- **I3b-01:** Compatible provider always sends `max_tokens` (no `max_completion_tokens` option); secret-like screening can reject legitimate `*_token` extra-body keys and long header values; base URLs must have path `/` (no reverse-proxy prefixes).
- **I3b-02:** Endpoint path check for `apiOrigin === null` uses `endsWith` (`preparedProviderRequestV2.ts:335-337`); mitigated by canonical origins and hard-coded paths.
- **I3b-03:** Historical attachments re-read from blobs every request without encoding proofs; Anthropic files-API beta header added when file ids appear only in history.
- **I3b-04:** `generationV2IpcRegistration.ts:162` swallows materialization scheduling errors without logging; registration has no rollback on partial failure.
- **I3b-05:** `assertExpectedCapabilityRevisionV2` fails open without AsyncLocalStorage context; IPC cores install it, so theoretical only (cf. I3a-05).
- **I3b-06:** Dead branches in `requestedParametersV2.ts:370-387` and `anthropicReasoningV2.ts:97-98`.
- **Phase 4a hand-off:** Anthropic text blocks require `citations`; check that interrupted Anthropic stream accumulation always produces it (interacts with P3b-01).

## 4. Uncertainties and excluded false positives

**Uncertainties:** P3b-07 (rule data using `preserve`), P3b-09 (DeepSeek tolerance), P3b-10 (resolver default effort), P3b-11 (Gemini schema subset), P3b-13 (provider MIME acceptance), P3b-17 URL-only case; P3b-03 renderer surfacing not exhaustively searched. OpenRouter chat compiler not reviewed.

**Held up:**
- Canonical JSON is deterministic (code-point order, −0 normalised, non-finite/accessor/symbol rejection, depth 128, byte bound).
- Prepared requests: private-constructor and WeakSet/WeakMap brands; body bytes copied out (no post-issue TOCTOU); body digest equals the immutable body; endpoint/header/stream policy re-validated at issue.
- Credentials never in prepared requests (applied later from a runtime lease); Gemini key in header; header plan forbids reserved names and CR/LF, caps counts/lengths.
- Compatible base URL canonicalised to origin (http/https, no userinfo/query/hash); local providers strictly loopback, http, explicit port, no credentials, hard-coded paths.
- OpenAI Responses is stateless (`store: false`, no `previous_response_id`), so no stale continuation IDs.
- Provider switch routes through portable history; native artifacts hash-verified; Gemini thought signatures and DeepSeek reasoning only replayed to their own provider and only when complete.
- Prototype-pollution defences: `closedObject`, native-field path parser, composer `object()` validator.
- Ledger: frozen, deduplicated, 1 MiB cap; plan/invocation hashes re-verified; rule conflicts throw; injected defaults domain-checked; tool registry caps (128 defs, 1 MiB), unique ids and names.
- File-selection grants are sender-, frame-URL-, TTL- and single-use-bound.

**Rejected:** fabricated 1,000,000 `max_tokens` sent on the wire (only when user sets it — folded into P3b-02); forged invocation hash (inside main-process trust boundary); nondeterministic canonical ordering; "fallback-augmented user text breaks native history" (adaptation recorded and routed to portable path, except the narrow case in P3b-17).

## 5. Next phase

**Phase 4a — generation runtime:** per-provider runtimes and stream parsers, operation runtime registry, timeouts and cancellation, body checkpoints and completion receipts during streaming, terminal artifacts, interrupted-turn capture (including the Anthropic `citations` hand-off), credential leases at dispatch, and the OpenRouter chat compiler/request path not reached in 3b.

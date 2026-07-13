# Generation Compiler V2 — Goal 2 Gate 0 Contract Audit

Status: **blocked before production implementation**. Verified 2026-07-13 against current first-party documentation and OpenAPI where available.

This audit records evidence discovered after Goal 1. It does not silently rewrite the implementation baseline. A conflict with the frozen plan blocks the affected contract and the production cutover until the Owner records a decision backed by an official schema or a real authenticated smoke.

## OpenAI Responses continuation

Official sources:

- <https://developers.openai.com/api/docs/guides/conversation-state>
- <https://developers.openai.com/api/docs/guides/reasoning>
- <https://developers.openai.com/api/reference/resources/responses/methods/create>

Verified facts:

- `previous_response_id` and `conversation` are mutually exclusive server-state modes.
- Stateless client-managed continuation is officially supported with `store:false`, `include:["reasoning.encrypted_content"]`, and complete ordered replay of native response output items plus the next user item.
- `reasoning.encrypted_content` is an opaque continuation artifact. Visible summary/text is not a substitute.
- Tool, web, image, reasoning, message, and future supported native item variants must be stored and replayed through a closed union. Unknown item variants block instead of being dropped.
- The Goal 1 recommended OpenAI client-managed mode is implementable, but the current Starverse generic role/text history is insufficient.

Disposition: **contract evidence complete; Owner approval of the recommended mode remains required by Gate 0**.

## LM Studio Responses-first qualification and fixed protocol binding

Official sources:

- <https://lmstudio.ai/docs/developer/rest/chat>
- <https://lmstudio.ai/docs/developer/rest/stateful-chats>
- <https://lmstudio.ai/docs/developer/rest>
- <https://lmstudio.ai/docs/developer/openai-compat/responses>
- <https://lmstudio.ai/docs/developer/openai-compat/chat-completions>
- <https://lmstudio.ai/changelog/lmstudio-v0.4.19>

Verified facts:

- Native `/api/v1/chat` defaults to `store:true`, returns `response_id`, and continues with `previous_response_id`.
- With `store:false`, native chat returns no continuation id.
- The native chat contract does not allow assistant messages in request input. Therefore a `store:false` native request cannot implement client-managed multi-turn replay; it is one-shot only.
- LM Studio Responses accepts assistant/native output items in request input and supports custom tools and SSE. Chat Completions can replay complete messages but is a different protocol.
- LM Studio 0.4.19 specifically fixes reasoning replay through `/v1/responses`; 0.4.19 is therefore the minimum V2 qualification version.
- LM Studio does not expose OpenAI-hosted `reasoning.encrypted_content`; qualification instead requires lossless replay of every native item actually returned by the local Responses endpoint.

Owner-frozen protocol selection:

- first candidate: `lmstudio-openresponses` at `/v1/responses`;
- qualification-failure alternative: `lmstudio-openai-chat-completions` at `/v1/chat/completions` with Starverse-owned complete `messages` replay;
- native `/api/v1/chat` is forbidden for ordinary multi-turn Starverse conversations;
- the endpoint profile persists exactly one successful contract ID/revision; transport errors never switch protocol and a single failed request never invokes the alternative.
- Authentication/authorization failure, connection refusal, timeout, 5xx, unavailable/unloaded model, transient runtime failure, cancellation, or an inconclusive smoke result fail closed and leave the endpoint unbound. They never trigger Chat Completions qualification.
- Only a repeatable Responses contract/item round-trip failure on an otherwise healthy qualified runtime may make Chat Completions eligible, and then only through a separate explicit setup qualification operation. It cannot run in the same send or qualification transaction; Chat is persisted only after its own complete-message suite passes.

Local exact-body qualification, 2026-07-14:

- LM Studio `0.4.19+2` (`ProductVersion 0.4.19.0`), CLI commit `9902c3a`, selected runtime `llama.cpp-win-x86_64-nvidia-cuda12-avx2@2.24.0`.
- Loopback-only server at `127.0.0.1:1234`; local models `gate0-qwen3-4b` and `gate0-qwen35-2b`; zero external provider requests and USD 0 cost.
- Eleven exact `/v1/responses` requests all returned HTTP 200. Every request serialized `store:false`; none contained `previous_response_id`.
- Complete client-owned replay passed for pure-text multi-turn and two branches from one persisted prefix. A separate restart audit serialized that prefix, recorded artifact SHA-256 `06de481179c4025664b140e6e32ddcdd3e9abe09fa52237ba5b75834f29dafc0`, and reloaded it in fresh child PID `16092` launched by PID `27916` before the next successful request.
- Native reasoning item and `reasoning_text` were captured unchanged and accepted in the next input. Native `function_call` retained its ID/call ID/name/arguments/status; the matching `function_call_output` round-trip produced the expected final message.
- The provider SSE sample included `response.created`, output deltas and exactly one final `response.completed`; no event followed it. This proves the observed provider event sequence, not Starverse's terminal coordinator, which remains an implementation acceptance test across completed/failed/incomplete/cancelled/connection-close paths.
- Exact serialized bodies/hashes, complete local responses and SSE fields, environment versions, assertions and conclusion are retained in [`evidence/lmstudio-openresponses-compliance-20260714.json`](evidence/lmstudio-openresponses-compliance-20260714.json).

Disposition: **qualification passed; bind this endpoint explicitly to `lmstudio-openresponses`. Starverse V2 must implement and persist the complete ordered Responses item union before enabling the binding. `lmstudio-openai-chat-completions` remains only the fixed qualification-failure alternative for a separately tested endpoint; it is not a runtime fallback. `/api/v1/chat` is not registered for ordinary conversations.**

## Ollama protocol findings

Official sources:

- <https://docs.ollama.com/api/chat>
- <https://docs.ollama.com/api/openai-compatibility>

Verified facts:

- Native `/api/chat` uses complete client-managed `messages[]`; it has no `store`, `response_id`, or `previous_response_id` field.
- Ollama's OpenAI-compatible Responses endpoint documents only a non-stateful flavor and does not support `previous_response_id` or `conversation`.
- Current official evidence does not prove OpenAI encrypted reasoning-item replay for Ollama Responses.

Disposition: native chat may use its own typed message continuation. Responses remains disabled until exact native-item fixtures and smoke prove the intended contract. Neither protocol may fall back to the other.

## Anthropic Messages matrix

Official sources:

- <https://platform.claude.com/docs/en/api/typescript/messages/create>
- <https://platform.claude.com/docs/en/build-with-claude/extended-thinking>
- <https://platform.claude.com/docs/en/build-with-claude/adaptive-thinking>
- <https://platform.claude.com/docs/en/build-with-claude/effort>
- <https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-search-tool>

Verified facts:

- `thinking.display` is a formal request field for adaptive and manual thinking; the closed values are `summarized` and `omitted`. It is invalid with disabled thinking.
- `omitted` still returns the signature required for continuation; lack of thinking deltas must never cause signature loss.
- Effort is `output_config.effort`, not a thinking child. Allowed effort, thinking modes, display default, sampling restrictions, and web tool versions vary by exact model family.
- Modern adaptive-only families reject manual budgets; newer families narrow sampling. Existing boolean-to-`thinking.type` mapping and builder token correction are invalid V2 behavior.
- Exact basic web-search support for older model families is not proven by a closed current official matrix and must remain unavailable pending evidence/smoke.

Disposition: `thinking.display` must be modeled as a capability-gated semantic field. The exact family matrix is implementation evidence; unproven model/tool combinations remain blocked.

## Gemini Developer API v1beta continuation

Official source:

- <https://ai.google.dev/api/interactions-api> (explicit beta view, `/v1beta/interactions`)

Verified facts:

- The Owner-frozen provider-owned `v1beta` endpoint remains officially documented.
- Interactions exposes `store`, returns an interaction `id`, and accepts `previous_interaction_id` for multi-turn continuation.
- Complete interaction steps include native model output and tool-call variants and must be stored as provider-native artifacts where the selected continuation mode requires them.
- GenerateContent remains a separate codec and continuation artifact family; no Interactions fallback is permitted.

Disposition: no version conflict. The V2 contract must type `previous_interaction_id` and native steps rather than reconstructing continuation from visible text.

## OpenRouter Images endpoint pinning smoke and revised decision

Official sources:

- <https://openrouter.ai/docs/guides/overview/multimodal/image-generation>
- <https://openrouter.ai/docs/guides/routing/provider-selection>
- <https://openrouter.ai/openapi.json>

Current official facts, re-verified 2026-07-14:

- Per-endpoint records expose `provider_tag`, `provider_slug`, definitive `supported_parameters`, `allowed_passthrough_parameters`, and `supports_streaming`.
- The Images guide now explicitly defines `provider.only`, `order`, `ignore`, `sort`, and `allow_fallbacks`, shows an Images request with `provider.only:["google-ai-studio"]` and `allow_fallbacks:false`, and instructs clients to use descriptor `provider_tag` values as routing slugs.
- The provider-routing guide permits a complete endpoint variant slug such as `google-vertex/global`; the base slug matches its variants.
- The raw OpenAPI observed during the corrected smoke was 1,615,258 UTF-8 bytes with SHA-256 `abaf90acc89dc3a2b4cd8824afcbf87734c8d0a5f4429ea85dca0d9eb02e353b`. `ImageGenerationRequest.provider` still resolved only `options`, so the machine schema lags the readable official documentation.

Incorrect-field smoke retained as negative evidence:

- Discovery used `GET /api/v1/images/models`, selected the stable non-Lite/non-preview Nano Banana 2 model `google/gemini-3.1-flash-image`, then followed its advertised `/api/v1/images/models/google/gemini-3.1-flash-image/endpoints` link.
- The current descriptors returned `google-ai-studio` for Google AI Studio and `google-vertex/global` for Google Vertex. Both supported the same lowest-cost request used by the smoke: one image, `resolution:"512"`, `aspect_ratio:"1:1"`, non-streaming, and the same prompt.
- Exactly three successful requests were sent: no-pin baseline, top-level `provider_tag:"google-ai-studio"`, and top-level `provider_tag:"google-vertex/global"`. No `provider.only`, `provider.order`, fallback flag, or other candidate selector was sent. No repeat was required.
- All three returned HTTP 200 and one PNG. The authoritative `GET /api/v1/generation?id=...` metadata for all three reported `provider_name:"Google"` and the same `provider_responses[0].endpoint_id:"275d7d39-ae50-4df3-8140-5dd69c3ab883"`.
- Each request cost USD 0.0448255; total smoke cost was USD 0.1344765.
- This proves only that top-level `provider_tag` produced no reliable routing difference. It does not test or refute the documented `provider.only` contract. Evidence remains in [`evidence/openrouter-images-provider-tag-smoke-20260714.json`](evidence/openrouter-images-provider-tag-smoke-20260714.json).

Corrected Owner-authorized `provider.only` smoke:

- Two requests used the same dynamically discovered model, `n:1`, `resolution:"512"`, `aspect_ratio:"1:1"`, and prompt. No baseline repeat was sent.
- AI Studio exact body used `provider.only:["google-ai-studio"]` and `allow_fallbacks:false`; HTTP 200 metadata reported `provider_name:"Google AI Studio"` and endpoint ID `a5c8267a-c7ec-42d3-9a53-08f34bce6af9`.
- Vertex Global exact body used `provider.only:["google-vertex/global"]` and `allow_fallbacks:false`; HTTP 200 metadata reported canonical provider name `Google` and endpoint ID `275d7d39-ae50-4df3-8140-5dd69c3ab883`, distinct from AI Studio and identical to the previously observed default Vertex endpoint.
- The authenticated OpenRouter Logs UI independently labeled the two corrected-smoke rows `Google AI Studio` and `Google Vertex`; their displayed costs (`$0.046` and `$0.0448`) and application label match the exact generation records. This closes the canonical `Google` metadata ambiguity for the Vertex request.
- The two responses and dashboard records therefore provide positive routing evidence for both discovered tags. No fallback or additional provider appeared in `provider_responses`.
- Costs were USD 0.045996 and USD 0.0448255; corrected-smoke total was USD 0.0908215.
- Exact serialized bodies and hashes, complete redacted responses/metadata, descriptors, OpenAPI hash/schema discrepancy, costs, and verdicts are retained in [`evidence/openrouter-images-provider-only-smoke-20260714.json`](evidence/openrouter-images-provider-only-smoke-20260714.json).

Disposition: **the OpenRouter Images request-side pinning contract is closed positively. V2 pins the selected fresh descriptor's exact `provider_tag` through `provider.only` with `allow_fallbacks:false`, limits `provider.options` to that descriptor's allowlist, and never emits top-level `provider_tag`, silently drops fields, switches endpoint, or resends after POST failure. The compile-time binding uses provider-owned selector identity (`provider_tag`, `provider_slug`, descriptor revision/digest), not the post-request generation endpoint ID. The readable-doc/OpenAPI discrepancy remains a versioned contract risk. Endpoint-specific capability implementation remains blocked only on the Owner decision for deterministic selection when multiple fresh descriptors satisfy the complete explicit intent.**

## Remaining Owner decisions

- Exact canonical Electron `appId` (repository proves only `productName=Starverse`).
- OpenRouter Images multiple-eligible-descriptor selection authority and deterministic tie-break policy; API order, observed price, and implicit provider preference are forbidden defaults.
- OpenAI client-managed native-items continuation approval.
- Explicit endpoint protocol pinning for Ollama/other local profiles; LM Studio is resolved above.
- OpenRouter beta server web-tool exposure.
- Automatic transport retry policy.
- Image continuation first-release scope.
- Whether Anthropic `thinking.display` is user-facing; the compiler/capability type must support the official field either way.

No production file may change until the remaining decisions and hard contract blockers are resolved in an ADR.

# TP6 — OpenRouter and OpenAI native contracts

Official contracts verified 2026-07-13. Each protocol has its own closed request/decoder/continuation package; shared semantic intent does not imply a shared wire path.

## Scope

Implement plan inputs for `OpenRouterChatContractV1`, `OpenRouterImagesContractV1`, and `OpenAIResponsesContractV1`, including exact request fields, capability sources, continuation artifacts, legacy deletion, fixtures, and live acceptance.

## OpenRouter Chat

Code evidence:

- `main:src/next/openrouter/buildRequest.ts:57-110,301-466` mixes text, reasoning, sampling, tools, legacy web plugin, and chat image output.
- `main:electron/ipc/openRouterStreamBridge.ts:375-388` sends `/api/v1/chat/completions`; `:142-173,373-374` rebuilds a lossy fallback body.
- `main:src/next/provider/openrouter/openRouterAdapter.ts:48-161` and `openRouterLegacyCredential.ts` retain legacy credential/request entrypoints.
- `main:src/next/context/buildMessages.ts:40-91` only conditionally replays `reasoning_details`; send preparation can degrade when DB bridge is absent (`openRouterSendPreparation.ts:131-195`).

Official evidence:

- [Chat/API overview](https://openrouter.ai/docs/api/reference/overview) — `POST /api/v1/chat/completions`, typed reasoning/tools/sampling.
- [Server Web Search](https://openrouter.ai/docs/guides/features/server-tools/web-search) — Beta `openrouter:web_search`; parameters verified include `engine`, `max_results`, `max_total_results`, `search_context_size`, `max_characters`, `user_location`, `allowed_domains`, `excluded_domains`.
- [Legacy Web Search plugin](https://openrouter.ai/docs/guides/features/plugins/web-search) — deletion-only legacy form.
- [Reasoning tokens](https://openrouter.ai/docs/guides/best-practices/reasoning-tokens) — ordered `reasoning_details` continuation.

Target request:

```json
POST /api/v1/chat/completions
{
  "model":"anthropic/claude-sonnet-...",
  "messages":[{"role":"user","content":"查找最新资料"}],
  "stream":true,
  "reasoning":{"effort":"high","exclude":false},
  "tools":[{
    "type":"openrouter:web_search",
    "parameters":{"engine":"native","max_results":5}
  }]
}
```

Decisions:

- Only server-tool web search is implemented. `plugins:[{id:'web'}]`, `:online`, and plugin fallback are deleted.
- The Chat contract does not emit image-output `modalities/image_config`; dedicated Images owns generation.
- `reasoning_details` and tool-call/result sequence are native continuation artifacts and must round-trip unchanged.
- Beta server tool is capability/evidence gated and never silently replaced by plugin or user-defined web tool.

## OpenRouter Images

Official evidence:

- [Image API](https://openrouter.ai/docs/guides/overview/multimodal/image-generation) — `POST /api/v1/images`; discovery at `/api/v1/images/models` and per-model `/endpoints`.
- [OpenRouter OpenAPI](https://openrouter.ai/openapi.json) — the exact endpoint record provides `provider_tag`, `provider_slug`, `supported_parameters`, `allowed_passthrough_parameters`, and `supports_streaming`. `provider_tag` is explicitly the request-side selection value. Missing capability key means unsupported; model-level values are only a union.

Native request fields verified: `model`, `prompt`, `n` (1–10), `resolution` (`512|1K|2K|4K` subject to endpoint), `aspect_ratio`, `size`, `quality` (`auto|low|medium|high`), `output_format` (`png|jpeg|webp|svg` where supported), `background`, `output_compression` (0–100 for jpeg/webp), `seed`, `stream`, `input_references`, and descriptor-limited `provider.options`.

```json
POST /api/v1/images
{
  "model":"openai/gpt-image-...",
  "prompt":"a red panda astronaut",
  "resolution":"2K",
  "aspect_ratio":"16:9",
  "quality":"high",
  "output_format":"png",
  "stream":true,
  "provider":{"only":["bytedance"],"allow_fallbacks":false}
}
```

Here `bytedance` is the selected descriptor's non-null `provider_tag`. The typed Images codec owns this pinning shape; Goal 2 contract fixtures and an authenticated smoke must prove that the serialized selector is accepted by `/api/v1/images` before the contract is enabled. No generic provider-routing object is exposed to semantic config.

Decisions:

- Selected endpoint descriptor is authoritative. Compilation rejects fields absent from it, and candidate selection must find one endpoint that supports the complete explicit image intent.
- The compiled request pins that endpoint with `provider_tag`; it never drops a field, lowers resolution, disables streaming, switches endpoint, or resends after a generation POST failure.
- `size` explicit pixels conflicts with mismatched `resolution/aspect_ratio` and is rejected before network.
- `provider.options[slug]` is a typed per-provider extension limited to `allowed_passthrough_parameters`, never an arbitrary object.
- Image response decoder preserves media type, final/partial event identity, usage, and error. Partial previews are not continuation truth.
- Descriptor cache identity is credential scope + model + endpoint. User settings use preset-normalized V2 keys `openrouter.images.endpointDescriptor.refreshAfterMs` (default 6h) and `hardExpireAfterMs` (default 24h), with `refreshAfter < hardExpireAfter`; 90-day diagnostic history is fixed and not user-configurable.
- Before refresh age, use the successful descriptor; between refresh and hard expiry, try refresh and retain/use stale-good on failure; at/after hard expiry, a successful refresh is mandatory. Refresh failure never overwrites success, `401/403` blocks, and `404` invalidates the endpoint immediately.

## OpenAI Responses

Code evidence:

- Main builder covers only `{model,input,stream,instructions,reasoning,max_output_tokens,tools}`: `main:src/next/provider/openai-responses/openaiResponsesRequestBuilder.ts:16-179`.
- HEAD's generation profile exposes only `reasoning.effort` and `reasoning.summary`: `src/next/generation-params/providerProfiles/openaiResponsesGenerationProfile.ts:21-53`.
- HEAD's native reasoning type and sanitizer accept only `effort` and `summary`: `src/next/provider/openai-responses/openaiResponsesRequestBuilder.ts:29-32,112-171`; the current model policy also only owns those fields (`openaiResponsesReasoningPolicy.ts:1-17,39-95`).
- HEAD adds other allowlisted fields but still spreads `imageConfig`: `src/next/provider/openai-responses/openaiResponsesRequestBuilder.ts:20-213`.
- Adapter sends `/responses` but history normalizes to visible messages and drops native response/reasoning items: `openaiResponsesAdapter.ts:66-88,189-220`; IPC remains string-oriented at `electron/ipc/openAIResponsesTextChatIpc.ts:21-34,259-277`.
- Summary delta/final parsing and display already exist at `openaiResponsesStreamMapper.ts:97-126,165-207`; V2 migrates and converges this capability rather than reimplementing it.

Official evidence:

- [Responses Create](https://developers.openai.com/api/reference/resources/responses/methods/create), verified 2026-07-13:
  - the request-level `reasoning` schema contains only `effort`, deprecated `generate_summary`, and `summary`;
  - Starverse implements `reasoning.effort` with model-level policy and `reasoning.summary`; deprecated `generate_summary` is not implemented;
  - the official schema has no `reasoning.context` or `reasoning.mode`;
  - `context_management` is a separate top-level array (currently `type:"compaction"` with optional `compact_threshold`, minimum 1000) and is not part of the V2 reasoning scope;
  - `previous_response_id` and `conversation` are mutually exclusive; prior instructions do not automatically carry through `previous_response_id`;
  - current request fields include `include`, `max_tool_calls`, `parallel_tool_calls`, `store`, `stream`, text format/verbosity, sampling, service tier, and typed tools.
- [Web Search guide](https://developers.openai.com/api/docs/guides/tools-web-search) — target tool `web_search`, not preview type.
- [Image generation tool](https://developers.openai.com/api/docs/guides/tools-image-generation) — native image tool fields and partial image events.
- [Models](https://developers.openai.com/api/docs/models) — field/model capability cannot be provider-wide.

Target request:

```json
POST /v1/responses
{
  "model":"gpt-5...",
  "input":[{"role":"user","content":[{"type":"input_text","text":"查询并生成图片"}]}],
  "stream":true,
  "reasoning":{"effort":"high","summary":"detailed"},
  "include":["reasoning.encrypted_content"],
  "tools":[
    {"type":"web_search","filters":{"allowed_domains":["example.com"]},"search_context_size":"high"},
    {"type":"image_generation","action":"auto","size":"1024x1024","quality":"high","output_format":"png","partial_images":2}
  ],
  "max_tool_calls":8
}
```

Decisions:

- Build a complete closed `OpenAIResponsesRequestV1`; no five-field allowlist or `imageConfig` spread.
- Migrate and converge the existing `reasoning.effort + reasoning.summary` profile, model policy, request mapping, streaming summary display, and persistence. Do not add `reasoning.context` or `reasoning.mode`.
- Any explicit unsupported reasoning field is rejected by the compiler; it is never silently omitted by sanitizer behavior.
- If `context_management` is later approved, model it as an independent top-level advanced Responses capability with its own evidence, semantic type, codec field, fixtures, and smoke. It is not a reasoning fallback or Goal 2 requirement.
- Do not accept OpenRouter image aliases (`aspect_ratio`, `image_size`) in this extension.
- Stateful continuation (`previous_response_id` or conversation) and client-managed native items are exclusive contract modes; transport failure never switches modes.
- Persist response/conversation id, complete reasoning item/encrypted content, tool call ids/results, and image generation call ids required by the chosen mode.

## Files, deletion, and tests

Add separate packages:

```text
src/next/generation-v2/providers/openrouter-chat/
src/next/generation-v2/providers/openrouter-images/
src/next/generation-v2/providers/openai-responses/
```

Each owns typed extension, capability loader, codec, native request, serializer, decoder, continuation artifacts, and exact fixtures.

Delete:

- OpenRouter legacy credential/facade/resolver/store, bridge fallback, chat image output, plugin/`:online`, broad capability, arbitrary patch;
- OpenAI image spread/alias cleanup, message-only continuation, hardcoded reasoning summary defaults, model regex, raw IPC bypass.

Tests/acceptance:

- Exact serialized-body fixtures for all three contracts from semantic intent.
- No-silent-drop ledger for every exposed field.
- OpenRouter endpoint capability missing/conflict rejection and descriptor revision pinning.
- `reasoning_details` byte/order round-trip; OpenAI encrypted/native item round-trip.
- Server tool plus user tool composition; OpenAI web/image tool event decoding.
- Live smoke through compiler only, with exact raw-body/hash assertion.

## Risks and Goal 2 prerequisites

| Severity | Item | Resolution |
|---|---|---|
| P0 | OpenAI current continuation drops reasoning items | Implement chosen native continuation mode before enabling contract. |
| P1 | OpenRouter image endpoint union mistaken for exact support | Cache/pin the selected endpoint descriptor and enforce the frozen refresh/hard-expiry policy before compilation. |
| P1 | Beta server tool changes | Visible beta gate and evidence revision; no plugin fallback. |
| Owner | OpenAI default continuation mode | Choose previous-response, conversation, or client-managed items. |
| Owner | OpenRouter Beta exposure | Choose hidden, explicit opt-in, or production disabled. |
| Fixed | Endpoint descriptor freshness | Preset settings/defaults, stale-good window, hard expiry, status handling, cache scope, and no-POST-fallback behavior are frozen above and in TP4. |

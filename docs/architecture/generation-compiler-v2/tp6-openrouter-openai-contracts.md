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
- [Image Generation Provider Routing](https://openrouter.ai/docs/guides/overview/multimodal/image-generation#provider-routing) — Images supports `provider.only`, `order`, `ignore`, `sort`, and `allow_fallbacks`; the documented pin example uses `provider.only:["google-ai-studio"]` and `allow_fallbacks:false`.
- [Provider Routing](https://openrouter.ai/docs/guides/routing/provider-selection) — a complete endpoint variant slug such as `google-vertex/global` targets that variant; the base slug may match all variants.
- [OpenRouter OpenAPI](https://openrouter.ai/openapi.json) — endpoint records provide `provider_tag`, `provider_slug`, `supported_parameters`, `allowed_passthrough_parameters`, and `supports_streaming`. The raw `ImageGenerationRequest.provider` schema observed in the corrected smoke still resolves only `options`, so the schema lags the readable official routing docs.
- [Incorrect top-level tag smoke](evidence/openrouter-images-provider-tag-smoke-20260714.json) — retained only to prove top-level `provider_tag` produced no reliable routing difference; it did not test the documented selector.
- [Corrected `provider.only` smoke](evidence/openrouter-images-provider-only-smoke-20260714.json) — dynamically discovered tags routed AI Studio and Vertex Global to distinct matching provider metadata and endpoint IDs with fallbacks disabled.

Native request fields verified: `model`, `prompt`, `n` (1–10), `resolution` (`512|1K|2K|4K` subject to endpoint), `aspect_ratio`, `size`, `quality` (`auto|low|medium|high`), `output_format` (`png|jpeg|webp|svg` where supported), `background`, `output_compression` (0–100 for jpeg/webp), `seed`, `stream`, `input_references`, documented provider routing, and descriptor-limited `provider.options`.

```json
POST /api/v1/images
{
  "model":"google/gemini-3.1-flash-image",
  "prompt":"A small blue circle centered on a plain white background.",
  "n":1,
  "resolution":"512",
  "aspect_ratio":"1:1",
  "provider":{"only":["google-ai-studio"],"allow_fallbacks":false}
}
```

The typed Images codec owns this selector; generic semantic config does not expose a free-form provider-routing object. `provider.only` contains exactly the selected descriptor's non-null `provider_tag`, and `allow_fallbacks` is always `false`.

Decisions:

- The selected endpoint descriptor is authoritative. Selection authority belongs to the user; price, API order, latency, historical success and hard-coded preference are forbidden inputs. Binding lookup key is `(credentialScopeId, modelId, image_generation)`.
- An existing tag remains bound while its latest complete fresh descriptor supports the complete intent. With no binding, exactly one eligible descriptor is atomically persisted; multiple eligible descriptors return `OPENROUTER_IMAGE_PROVIDER_SELECTION_REQUIRED`; zero block as unsupported. Duplicate tags invalidate the complete descriptor set.
- Missing/incomplete/hard-expired/stale bound descriptor stale-rejects. A present fresh binding that cannot support changed parameters returns `BOUND_ENDPOINT_CAPABILITY_MISMATCH`; the user must explicitly rebind and submit a new command. Resolver/compiler/transport never substitute an endpoint in the same command.
- The compiled request pins exactly that endpoint through `provider.only:[provider_tag]` plus `allow_fallbacks:false`. It never emits top-level `provider_tag`, drops a field, lowers resolution, disables streaming, switches endpoint, or resends after a generation POST failure.
- The preflight binding stores provider-owned selector identity (`provider_tag`, `provider_slug`, descriptor revision/digest). The generation endpoint ID is response/log evidence and is not available as a compile-time descriptor key.
- `size` explicit pixels conflicts with mismatched `resolution/aspect_ratio` and is rejected before network.
- `provider.options[provider_slug]` is a typed selected-provider extension limited to the selected descriptor's `allowed_passthrough_parameters`, never an arbitrary object.
- Binding changes atomically remove option namespaces/keys not valid for the newly selected `provider_slug` and allowlist. No stale provider option reaches compiler input.
- Candidate UI places the bound tag first and code-point sorts only remaining `provider_tag` values. That order is presentation-only and cannot produce a binding.
- Image response decoder preserves media type, final/partial event identity, usage, and error. Partial previews are not continuation truth.
- Descriptor cache identity is credential scope + model + `provider_tag` + endpoint revision. User settings use preset-normalized V2 keys `openrouter.images.endpointDescriptor.refreshAfterMs` (default 6h) and `hardExpireAfterMs` (default 24h), with `refreshAfter < hardExpireAfter`; 90-day diagnostic history is fixed and not user-configurable.
- Before refresh age, use the selected successful descriptor; between refresh and hard expiry, try refresh and retain/use stale-good on failure; at/after hard expiry, successful refresh is mandatory. Refresh failure never overwrites success, `401/403` blocks, and `404` immediately invalidates the selected descriptor. A successful refresh that omits the bound tag invalidates the old capability revision and stale-rejects the command. A different endpoint requires a new resolver run under the frozen policy; refresh, compiler, and transport never substitute one inside the same command.

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
- OpenRouter selected-endpoint capability missing/conflict rejection, complete-intent selection, descriptor revision pinning, and exact `provider.only` body.
- `reasoning_details` byte/order round-trip; OpenAI encrypted/native item round-trip.
- Server tool plus user tool composition; OpenAI web/image tool event decoding.
- Live smoke through compiler only, with exact raw-body/hash assertion.
- Versioned regression fixtures for both 2026-07-14 results: top-level `provider_tag` is forbidden, while `provider.only:[provider_tag]` plus `allow_fallbacks:false` is required and routes both tested endpoints correctly.

## Risks and Goal 2 prerequisites

| Severity | Item | Resolution |
|---|---|---|
| P0 | OpenAI current continuation drops reasoning items | Implement chosen native continuation mode before enabling contract. |
| P1 | OpenRouter image model union mistaken for exact endpoint support | Select/cache one descriptor that supports the complete intent, pin its revision/tag, and enforce refresh/hard-expiry before compilation. |
| P1 | Beta server tool changes | Visible beta gate and evidence revision; no plugin fallback. |
| Owner | OpenAI default continuation mode | Choose previous-response, conversation, or client-managed items. |
| Owner | OpenRouter Beta exposure | Choose hidden, explicit opt-in, or production disabled. |
| Fixed | Endpoint descriptor freshness | Preset settings/defaults, stale-good window, hard expiry, status handling, cache scope, and no-POST-fallback behavior are frozen above and in TP4. |
| Fixed | Images endpoint routing | Current readable docs plus corrected 2026-07-14 smoke establish `provider.only:[provider_tag]` and `allow_fallbacks:false`; top-level `provider_tag` is forbidden. Raw OpenAPI lag is recorded and guarded by versioned exact-body/live fixtures. |

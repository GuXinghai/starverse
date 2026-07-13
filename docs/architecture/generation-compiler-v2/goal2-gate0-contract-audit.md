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

## LM Studio continuation conflict

Official sources:

- <https://lmstudio.ai/docs/developer/rest/chat>
- <https://lmstudio.ai/docs/developer/rest/stateful-chats>
- <https://lmstudio.ai/docs/developer/rest>
- <https://lmstudio.ai/docs/developer/openai-compat/responses>
- <https://lmstudio.ai/docs/developer/openai-compat/chat-completions>

Verified facts:

- Native `/api/v1/chat` defaults to `store:true`, returns `response_id`, and continues with `previous_response_id`.
- With `store:false`, native chat returns no continuation id.
- The native chat contract does not allow assistant messages in request input. Therefore a `store:false` native request cannot implement client-managed multi-turn replay; it is one-shot only.
- LM Studio Responses and Chat Completions are different protocols. Chat Completions can replay messages but is not a Responses-native continuation contract. The current LM Studio Responses documentation does not prove OpenAI-style `reasoning.encrypted_content` replay.

Conflict with Goal 1: the final plan recommends client-managed native `store:false`. Current official LM Studio semantics show this cannot preserve native multi-turn conversation state.

Required Owner resolution before enabling LM Studio native chat:

1. use server-managed `store:true + previous_response_id` and persist the native id; or
2. expose native `/api/v1/chat` as one-shot only; or
3. disable native chat and enable only independently proven fixed protocols.

Disposition: **hard blocker; no fallback or synthetic assistant-history replay is allowed**.

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

## OpenRouter Images endpoint pinning gap

Official sources:

- <https://openrouter.ai/docs/guides/overview/multimodal/image-generation>
- <https://openrouter.ai/openapi.json>

Verified facts:

- Per-endpoint records expose `provider_tag`, `provider_slug`, definitive `supported_parameters`, `allowed_passthrough_parameters`, and `supports_streaming`.
- Documentation says `provider_tag` is for request-side selection and may be null.
- The current official `ImageGenerationRequest` OpenAPI schema contains only `provider.options` under `provider`; it contains no `provider_tag`, `provider.only`, `provider.order`, or `allow_fallbacks` selector.
- The dedicated Images guide's request parameter table likewise lists only `provider.options`. No official example serializes `provider_tag` into a generation request.
- The Goal 1 request example uses `provider.only` plus `allow_fallbacks:false`, but that is not part of the current dedicated Images request schema.

Consequences:

- Starverse cannot implement the frozen complete-intent endpoint pin using an undocumented field.
- Model selection alone is insufficient when several endpoint descriptors exist.
- `provider.options[provider_slug]` is passthrough configuration, not evidence of routing pinning.

Required evidence before enabling OpenRouter Images:

1. an updated official request schema/example that defines how `provider_tag` is serialized; or
2. an authenticated real smoke, retained with exact request bytes and response/provider evidence, that proves the accepted pin shape and no fallback behavior.

Disposition: **hard blocker; OpenRouter Images contract and all production cutover work remain stopped because the release has no compatibility or partial-enable path**.

## Remaining Owner decisions

- Exact canonical Electron `appId` (repository proves only `productName=Starverse`).
- OpenAI client-managed native-items continuation approval.
- LM Studio native conflict resolution listed above.
- Explicit endpoint protocol pinning for LM Studio/Ollama/local profiles.
- OpenRouter beta server web-tool exposure.
- Automatic transport retry policy.
- Image continuation first-release scope.
- Whether Anthropic `thinking.display` is user-facing; the compiler/capability type must support the official field either way.

No production file may change until these decisions and both hard contract blockers are resolved in an ADR.

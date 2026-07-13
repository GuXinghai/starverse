# TP7 — Anthropic, Gemini, DeepSeek, and Generic/local contracts

Official contracts verified 2026-07-13. No provider or local server in this package shares a wire codec or failure fallback.

## Anthropic Messages

Code evidence:

- `main:src/next/provider/anthropic/anthropicRequestBuilder.ts:16-156` has partial manual thinking support but no current model rule matrix.
- HEAD maps a boolean into `thinking.type` (`generation-params/providerProfiles/anthropicGenerationProfile.ts:52-65`) and shallow-passes it (`anthropicRequestBuilder.ts:85-108`); builder tests bypass the mapper with a correct native object (`anthropicRequestBuilder.test.ts:115-124`).
- `anthropicMessagesNativeContentAccumulator.ts:28-234` and `anthropicTextChat.ts:61-154` provide useful exact thinking/signature/redacted/tool block material.

Official evidence:

- [Messages Create](https://platform.claude.com/docs/en/api/messages/create): `POST /v1/messages`; `system` is top-level, not a system-role message. Verified fields include `model`, `max_tokens`, `messages`, `system`, `stop_sequences`, `temperature`, `thinking`, `tools`, `top_k`, `top_p`, and `stream`.
- [Extended thinking](https://platform.claude.com/docs/en/docs/build-with-claude/extended-thinking): thinking/signature/redacted blocks must be replayed complete and ordered during tool continuation.
- [Effort](https://platform.claude.com/docs/en/build-with-claude/effort) and [adaptive thinking](https://platform.claude.com/docs/en/build-with-claude/adaptive-thinking): model families differ. Current evidence includes models that reject manual budget, default/require adaptive thinking, reject disabled, expose `xhigh|max`, or restrict non-default sampling.
- [Web search](https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-search-tool): server tool versions are explicit contracts.

```json
POST /v1/messages
{
  "model":"claude-opus-4-8",
  "max_tokens":65536,
  "messages":[{"role":"user","content":[{"type":"text","text":"分析问题"}]}],
  "thinking":{"type":"adaptive","display":"summarized"},
  "output_config":{"effort":"xhigh"},
  "tools":[{
    "type":"web_search_20260209","name":"web_search","max_uses":5,
    "allowed_domains":["example.com"],"allowed_callers":["direct"]
  }],
  "stream":true
}
```

Decisions:

- Use a provider-native discriminated union, but legal branches/ranges come from an evidence-versioned exact model rule, not regex.
- Manual `budget_tokens < max_tokens` is only a manual-mode constraint; it does not imply support.
- Preserve complete native content block order/signatures/redacted data as continuation artifacts.
- Image generation/edit is unavailable; image input is a separate capability.

Blocking input: build and review the current model × thinking mode × effort × sampling × web-tool-version matrix before enabling Anthropic V2. Delete the boolean mapper first.

## Gemini / Google AI Studio

Code evidence:

- GenerateContent does `Object.assign(generationConfig, nativeGenerationConfig)`: `src/next/provider/gemini/geminiRequestBuilder.ts:139-149`.
- Interactions sends two obsolete search objects: `:292-315`; adapter currently uses `/v1beta/interactions` (`geminiAdapter.ts:274`).
- Native accumulator retains candidate parts/thought signatures (`geminiProviderNativeAccumulator.ts:31-150`); image Interactions rejects history (`geminiAdapter.ts:69-87`).

Official evidence and Owner version resolution:

- Google's current prose/reference pages [Interactions API](https://ai.google.dev/api/interactions-api), [thinking](https://ai.google.dev/gemini-api/docs/thinking), [migration](https://ai.google.dev/gemini-api/docs/migrate-to-interactions), and image examples still show `POST https://generativelanguage.googleapis.com/v1beta/interactions` and describe the API as recommended/preview.

Owner resolves the deployable version as `v1beta` for the entire Gemini Developer API provider. Starverse neither consumes a V1 schema for V1Beta field ownership nor creates per-model/per-operation version bindings. Future migration to `v1` replaces the provider contract as one reviewed change.

Interactions V1Beta target shape from current prose docs:

```json
POST /v1beta/interactions
{
  "model":"gemini-3.1-flash-image",
  "input":[{"type":"text","text":"生成带实时资料的图表"}],
  "tools":[{"type":"google_search","search_types":["web_search","image_search"]}],
  "response_format":[
    {"type":"text"},
    {"type":"image","mime_type":"image/jpeg","aspect_ratio":"16:9","image_size":"2K"}
  ],
  "generation_config":{"thinking_level":"medium","thinking_summaries":"auto","temperature":0.7},
  "stream":true
}
```

GenerateContent remains a separate bound contract:

```json
POST /v1beta/models/{model}:streamGenerateContent?alt=sse
{
  "contents":[{"role":"user","parts":[{"text":"解释问题"}]}],
  "generationConfig":{
    "temperature":0.7,"topP":0.9,"maxOutputTokens":4096,
    "thinkingConfig":{"thinkingLevel":"MEDIUM","includeThoughts":true},
    "candidateCount":1
  },
  "tools":[{"googleSearch":{}}]
}
```

Decisions:

- `GeminiDeveloperApiContract` centrally owns `apiVersion: "v1beta"`; UI, capability records, builders, and transports contain no hard-coded version segment. GenerateContent, Interactions, and future Agents obtain the version only from this contract.
- Interactions and GenerateContent have independent typed contracts/codecs/decoders/artifacts. No failure fallback, version table, endpoint auto-probe, or automatic migration exists.
- Interactions uses one Google Search tool and top-level `response_format`; obsolete dual search objects and `generation_config.image_config` are deleted.
- GenerateContent retains its native camelCase shape and candidate/part thought-signature continuation.
- MIME and image fields are bound to the selected `v1beta` codec revision and exact capability evidence. A field absent from the selected model/operation capability blocks instead of widening from another Gemini codec.

## DeepSeek official

Code evidence:

- Main request uses incomplete reasoning fields: `main:src/next/provider/deepseek/deepSeekRequestBuilder.ts:20-87`.
- HEAD repeats the boolean-to-`thinking.type` bug (`deepseekGenerationProfile.ts:46-58`; builder shallow pass `deepSeekRequestBuilder.ts:61-78`).
- Live history keeps visible text only (`deepSeekTextChat.ts:40-70`) although stream mapper reads reasoning/tools (`deepSeekStreamMapper.ts:149-208`).

Official evidence:

- [Thinking Mode](https://api-docs.deepseek.com/guides/thinking_mode/) and [Create Chat Completion](https://api-docs.deepseek.com/api/create-chat-completion), verified 2026-07-13:
  - `thinking:{type:'enabled'|'disabled'}`; default enabled for current V4 documentation;
  - `reasoning_effort` maps current compatibility values to `high|max` behavior;
  - when thinking, `temperature`, `top_p`, `presence_penalty`, and `frequency_penalty` are accepted but have no effect;
  - tool subturn continuation must return complete assistant `reasoning_content` and tool calls or the API returns 400.

```json
POST /chat/completions
{
  "model":"deepseek-v4-pro",
  "messages":[
    {"role":"user","content":"查询天气"},
    {"role":"assistant","content":"我将查询。","reasoning_content":"...","tool_calls":[{"id":"call_1","type":"function","function":{"name":"weather","arguments":"{}"}}]},
    {"role":"tool","tool_call_id":"call_1","content":"{\"temperature\":20}"}
  ],
  "thinking":{"type":"enabled"},
  "reasoning_effort":"high",
  "tools":[],
  "stream":true
}
```

Decisions:

- Compiler rejects explicit sampling when thinking is enabled rather than relying on provider no-effect behavior.
- `reasoning_content` plus tool-call sequence is a required provider-native artifact.
- No web/image output capability; never route DeepSeek through Generic.
- Delete boolean mapper and model-name regex.

## Generic, LM Studio, and Ollama

Code evidence:

- Main Generic body is minimal (`main:src/next/provider/generic/genericRequestBuilder.ts:15-68`) but adapter has config/resolver and raw compatibility entries and ignores reasoning/tools (`genericAdapter.ts:66-110,236`).
- HEAD compatible registry/revision pinning and exact serialized-body transport are useful (`domain.ts:185-209`, `routeSchemas.ts:16-105`, `compatibleChatRuntimeService.ts:219-260`), but `extraBody`, arbitrary target paths, unknown promotion, and built-in fallback are forbidden (`buildCompatibleChatRequest.ts:124-163`, `semanticDecoder.ts:12-98`, `extensionCapture.ts:19-47`, `schemas.ts:246-249`).

Official protocol evidence:

- LM Studio: [REST overview](https://lmstudio.ai/docs/developer/rest), [native chat](https://lmstudio.ai/docs/developer/rest/chat), [Responses](https://lmstudio.ai/docs/developer/openai-compat/responses), [Chat Completions](https://lmstudio.ai/docs/developer/openai-compat/chat-completions). Native `/api/v1/chat` is stateful with `previous_response_id/store`; Responses and Chat Completions are distinct.
- Ollama: [native chat](https://docs.ollama.com/api/chat), [thinking](https://docs.ollama.com/capabilities/thinking), [tool calling](https://docs.ollama.com/capabilities/tool-calling), [OpenAI compatibility](https://docs.ollama.com/api/openai-compatibility). Native `/api/chat`/`api/generate`, OpenAI Chat, and OpenAI Responses are distinct; Ollama Responses does not support stateful continuation.

Independent bindings required:

```text
GenericOpenAIChatContract
LmStudioNativeChatContract
LmStudioResponsesContract
LmStudioOpenAIChatContract
OllamaNativeChatContract
OllamaNativeGenerateContract
OllamaOpenAIChatContract
OllamaOpenAIResponsesContract
```

```json
POST /api/v1/chat
{"model":"ibm/granite-4-micro","input":"继续解释","previous_response_id":"resp_...","store":true}
```

```json
POST /api/chat
{"model":"qwen3","messages":[{"role":"user","content":"解释问题"}],"think":true,"tools":[],"stream":true}
```

Ollama `think` is contract/model-specific (boolean for many models; effort-like enum for others). No universal boolean control is encoded directly.

Decisions:

- Endpoint profile pins exactly one protocol and codec revision. Failure blocks; it never tries a second protocol.
- Generic defaults to verified text/basic streaming/basic sampling only.
- Override can only narrow/select codec-implemented capabilities; it cannot invent request paths.
- Native streams get native decoders/artifacts; do not normalize to synthetic OpenAI chunks as persistence truth.

## Files, deletions, tests, acceptance

Add one package per binding under `src/next/generation-v2/providers/`, each containing extension, capability rules, request, codec, serializer, decoder, continuation artifact, and fixtures.

Delete generic mapper/unknown patch/extraBody/raw compatibility/fallback; provider model regex; Anthropic/DeepSeek boolean mapping; Gemini object assign/dual search/auto-fallback; synthetic native stream as stored truth.

Tests:

- Exact semantic→native bytes and exhaustive ledger for every listed binding.
- Current Anthropic model rule matrix and exact block-order continuation.
- Gemini provider-version ownership guard, `v1beta` endpoint fixtures for each codec, search/image/thinking fields, thought signatures, and no-version-fallback tests.
- DeepSeek thinking/sampling rejection and multi-tool `reasoning_content` replay.
- Endpoint profile protocol pinning; simulated failure proves no alternate route.
- Native decoders preserve provider artifacts; architecture guards forbid shared Generic codec.

Acceptance:

- Every protocol/field has an official URL and verification date.
- No generalized provider semantics, unknown patch, or local-protocol fallback.
- A protocol is enabled only when its codec, capability evidence, continuation artifacts, exact fixtures, and live smoke all agree.

## Goal 2 prerequisites and Owner decisions

1. **Fixed:** Gemini Developer API is `v1beta`-only and provider-contract-owned; no model/operation version table or fallback.
2. **Blocker:** freeze Anthropic current model thinking/effort/sampling/web-tool matrix.
3. **Blocker:** remove Anthropic/DeepSeek boolean mapper before enabling V2.
4. **Owner:** pin each LM Studio/Ollama endpoint profile protocol; choose LM Studio native `store:true` stateful versus client-managed.
5. **Owner:** define OpenRouter beta server-tool exposure policy; Gemini API version is not part of this choice.
6. **Owner:** decide whether Anthropic `thinking.display` is user-facing; continuation preservation is mandatory either way.

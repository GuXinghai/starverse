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
- Current LM Studio IPC still exposes OpenAI Chat/Responses plus native REST. Its Responses body reduces history to role/content messages and omits forced `store:false` (`electron/ipc/lmStudioLocalProviderIpc.ts:855-887`); native REST flattens prior messages into a string.
- Current LM Studio renderer always applies the Chat Completions mapper to its JSON stream (`src/next/live/lmStudioTextChat.ts:224-244`). That mapper reads only `choices[].delta/message` (`src/next/streaming/core/localOpenAIChatCompletionsStreamMapper.ts:12-69`), so it cannot consume Responses text/reasoning/function item events. The Gate 0 provider pass does not make this production path compliant; V2 must replace it.

Official protocol evidence:

- LM Studio: [REST overview](https://lmstudio.ai/docs/developer/rest), [native chat](https://lmstudio.ai/docs/developer/rest/chat), [Responses](https://lmstudio.ai/docs/developer/openai-compat/responses), [Chat Completions](https://lmstudio.ai/docs/developer/openai-compat/chat-completions), [0.4.19 changelog](https://lmstudio.ai/changelog/lmstudio-v0.4.19). Native `/api/v1/chat` cannot accept assistant history and is forbidden for ordinary Starverse multi-turn. Responses and Chat Completions are distinct fixed protocol candidates; 0.4.19 is the minimum Responses qualification version because it fixes reasoning replay.
- Ollama: [native chat](https://docs.ollama.com/api/chat), [thinking](https://docs.ollama.com/capabilities/thinking), [tool calling](https://docs.ollama.com/capabilities/tool-calling), [OpenAI compatibility](https://docs.ollama.com/api/openai-compatibility). Native `/api/chat`/`api/generate`, OpenAI Chat, and OpenAI Responses are distinct; Ollama Responses does not support stateful continuation.

Independent bindings required:

```text
GenericOpenAIChatContract
LmStudioOpenResponsesContract (`lmstudio-openresponses`)
LmStudioOpenAIChatCompletionsContract (`lmstudio-openai-chat-completions`)
OllamaNativeChatContract
OllamaNativeGenerateContract
OllamaOpenAIChatContract
OllamaOpenAIResponsesContract
```

```json
POST /v1/responses
{
  "model":"local-qualified-model",
  "store":false,
  "input":[
    {"role":"user","content":[{"type":"input_text","text":"Call add_numbers."}]},
    {"id":"fc_1","call_id":"call_1","type":"function_call","name":"add_numbers","arguments":"{\"a\":2,\"b\":3}","status":"completed"},
    {"type":"function_call_output","call_id":"call_1","output":"5"},
    {"role":"user","content":[{"type":"input_text","text":"Use the result."}]}
  ],
  "tools":[{"type":"function","name":"add_numbers","parameters":{"type":"object","properties":{"a":{"type":"integer"},"b":{"type":"integer"}},"required":["a","b"],"additionalProperties":false},"strict":true}],
  "stream":true
}
```

```json
POST /api/chat
{"model":"qwen3","messages":[{"role":"user","content":"解释问题"}],"think":true,"tools":[],"stream":true}
```

Ollama `think` is contract/model-specific (boolean for many models; effort-like enum for others). No universal boolean control is encoded directly.

Decisions:

- Endpoint profile pins exactly one protocol and codec revision. Failure blocks; it never tries a second protocol.
- LM Studio qualification tries `/v1/responses` first. Every required native item must round-trip unchanged with `store:false` and no `previous_response_id`; success fixes `lmstudio-openresponses` for that endpoint.
- If Responses qualification fails, the endpoint may instead be qualified once against `/v1/chat/completions` and fixed to `lmstudio-openai-chat-completions`, which replays complete ordered messages. This is setup-time contract selection, not runtime fallback.
- Auth/connect/timeout/5xx/model-unavailable/runtime/cancel/inconclusive failures fail closed and cannot start the alternative. Chat eligibility requires a repeatable native-item contract failure on an otherwise healthy runtime and a separate explicit setup qualification operation; the same send/qualification transaction never changes protocol.
- Ordinary conversations never use LM Studio `/api/v1/chat`. A request failure, stream interruption or terminal error never switches the fixed protocol.
- The 2026-07-14 local suite on LM Studio `0.4.19+2` / runtime `2.24.0` passed text multi-turn, branching, auditable fresh-process persisted-artifact replay, reasoning item, function call/output and the provider SSE terminal shape; exact evidence is [`evidence/lmstudio-openresponses-compliance-20260714.json`](evidence/lmstudio-openresponses-compliance-20260714.json). Starverse terminal coordinator paths remain implementation tests.
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
- LM Studio 0.4.19+ exact-body qualification: `store:false`, no `previous_response_id`, complete ordered input/output item equality, text multi-turn, two branches, fresh-process persisted artifact hash/PID evidence, reasoning, function call/output and native SSE event coverage.
- Qualification failure taxonomy tests prove transient/inconclusive failures leave the endpoint unbound and never start Chat; a repeatable contract failure can only enable a separately invoked Chat qualification.
- LM Studio Responses decoder consumes `response.*` events directly; architecture test forbids reuse of the Chat Completions mapper and forbids `/api/v1/chat` for ordinary conversations.
- Qualification-failure Chat Completions path, when selected, must independently prove complete `messages` replay before its contract ID is persisted.
- Native decoders preserve provider artifacts; architecture guards forbid shared Generic codec.

Acceptance:

- Every protocol/field has an official URL and verification date.
- No generalized provider semantics, unknown patch, or local-protocol fallback.
- A protocol is enabled only when its codec, capability evidence, continuation artifacts, exact fixtures, and live smoke all agree.

## Goal 2 prerequisites and Owner decisions

1. **Fixed:** Gemini Developer API is `v1beta`-only and provider-contract-owned; no model/operation version table or fallback.
2. **Blocker:** freeze Anthropic current model thinking/effort/sampling/web-tool matrix.
3. **Blocker:** remove Anthropic/DeepSeek boolean mapper before enabling V2.
4. **Fixed:** LM Studio 0.4.19+ Responses-first qualification selects exactly one endpoint binding. The tested endpoint is `lmstudio-openresponses`; Chat Completions is only the separately qualified failure alternative, and native `/api/v1/chat` is forbidden for ordinary conversations. Ollama profiles still require explicit protocol selection.
5. **Owner:** define OpenRouter beta server-tool exposure policy; Gemini API version is not part of this choice.
6. **Owner:** decide whether Anthropic `thinking.display` is user-facing; continuation preservation is mandatory either way.

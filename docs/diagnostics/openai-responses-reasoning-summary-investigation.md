# OpenAI Responses reasoning.summary investigation

Date: 2026-07-08

Scope: investigation only. This report is based on local source inspection. No production runtime logic was changed and no real OpenAI API request was sent.

## Conclusion Summary

Starverse has a partial OpenAI Responses `reasoning.summary` implementation.

- Implemented:
  - OpenAI Responses request builder can send provider-native `reasoning.summary`.
  - Generation params profile exposes `reasoningSummary` for OpenAI Responses reasoning-capable model overrides.
  - Streaming mapper parses `response.reasoning_summary_text.delta` into reasoning raw details and reasoning display blocks.
  - Tests cover builder summary passthrough and streaming summary delta mapping.
- Partially implemented:
  - `reasoning.summary` is wired through the generic generation params stack, but there is no dedicated OpenAI Responses summary policy.
  - Summary capability is attached to every model matched by the effort policy; summary support is not independently modeled.
  - Final `reasoning` output item `summary[]` is preserved only as a raw/opaque reasoning item and is not turned into display summary text.
- Not implemented:
  - No OpenAI Responses `reasoning.summary` diagnostic probe exists.
  - No summary-only real provider verification exists.
  - No explicit per-model summary gate separate from `reasoning.effort`.
- Risks:
  - Normal UI/profile path does not offer `summary="none"` for OpenAI Responses, but lower-level type and IPC/direct provider-native payload paths can still pass `reasoning.summary = "none"`.
  - Direct provider-native `generationParams.reasoning = {}` can reach the request builder and produce empty `reasoning: {}`.
  - If OpenAI returns summary only through a final `reasoning` output item `summary[]`, current display path may not show it.
  - `reasoning.summary` support is inferred from effort-capable model family rules, not from a validated summary capability matrix.

Recommended status: partial implementation, needs a small hardening and verification slice before claiming support.

## Evidence List

| Area | File | Symbols | Evidence summary | Current behavior |
| --- | --- | --- | --- | --- |
| Request builder | `src/next/provider/openai-responses/openaiResponsesRequestBuilder.ts` | `ResponsesReasoningConfig`, `buildResponsesRequest`, `validateOpenAIResponsesGenerationParams` | Type includes `summary?: 'auto' | 'none' | 'concise' | 'detailed'`; builder applies raw `generationParams` to allowed top-level keys including `reasoning`; validation rejects only `reasoning.effort = "auto"`. | Can send `reasoning.summary`; direct raw payload can still include `summary="none"` or empty `reasoning: {}`. |
| Request builder tests | `src/next/provider/openai-responses/openaiResponsesRequestBuilder.test.ts` | `includes reasoning config from generationParams only`, `allows reasoning summary without explicit reasoning effort` | Tests assert `generationParams: { reasoning: { effort, summary: 'concise' } }` maps to `reasoning`, and summary alone maps to `{ summary: 'concise' }`. | Confirms intended summary passthrough. |
| Provider profile | `src/next/generation-params/providerProfiles/openaiResponsesGenerationProfile.ts` | `reasoningSummaryCapability`, `reasoningOverride` | `reasoningSummaryCapability` uses `wirePath: ['reasoning', 'summary']` and enum values `auto/concise/detailed`; model overrides add summary anywhere effort rules match. | Summary follows effort model family rules; no separate summary policy. |
| Reasoning policy | `src/next/provider/openai-responses/openaiResponsesReasoningPolicy.ts` | `OPENAI_RESPONSES_REASONING_RULES`, `getOpenAIResponsesReasoningSpec` | Rules cover GPT-5 family and `^o\d`; non-reasoning model patterns include `gpt-4.1`, `gpt-image`, embedding/audio/moderation families. | Effort policy exists; summary policy does not. |
| Generation params resolver | `src/next/generation-params/generationParamResolver.ts` | `resolveGenerationParamsFromLayers` | OpenAI `reasoningEffort=auto` becomes `providerAuto` and is omitted; other supported params are added to `requestParams`. | Effort auto is not sent. Summary auto is sent if selected and supported by capability. |
| Generation params mapper | `src/next/generation-params/generationParamMappers.ts` | `mapGenerationParamsToProviderRequestPatch` | Maps request params to provider wire paths; only special-cases OpenAI `reasoningEffort=auto`. | `reasoningSummary=auto/concise/detailed` maps to `reasoning.summary`. |
| UI editor | `src/ui-app/components/GenerationParamsSettingsEditor.vue` | `fallbackEnumValues`, `visibleSpecs`, `showAdvanced` | Fallback enum for `reasoningSummary` includes `none/auto/concise/detailed`; profile-based OpenAI capability only exposes `auto/concise/detailed`. Advanced hidden params are shown when expanded. | In normal OpenAI profile path, `none` is not offered; without profile or stale stored values, `none` remains a possible fallback/stored value. |
| Settings persistence | `src/next/generation-params/generationParamPersistence.ts` | `generationParamsDefaults`, `generationParamsOverride` | Stores arbitrary normalized `GenerationParamKey` settings, including `reasoningSummary`. | There is persistence for summary settings; no migration for old/illegal summary values. |
| App send path | `src/ui-app/app/appChatApp.logic.ts` | `resolveGenerationParamsConfigForConvoId`, `createExperimentalRuntimeTextEvents` | Resolves stored generation params, maps to wire patch, then passes `generationParams` to OpenAI Responses bridge when patch is non-empty. | Summary can reach OpenAI Responses send path via normal generation params. |
| IPC validation | `electron/ipc/providerGenerationParamsPayload.ts` | `validateProviderGenerationParamsPayload` | Accepts any plain JSON object under 20 KB; does not validate OpenAI-native nested enum values. | Direct/bridge payloads can bypass UI/profile enum restrictions. |
| OpenAI IPC | `electron/ipc/openAIResponsesTextChatIpc.ts` | `validateOpenAIResponsesTextChatPayload`, `buildProviderRequest` | Validated `generationParams` is copied into `ProviderStreamConfig`. | IPC does not reject `reasoning.summary="none"` or empty `reasoning:{}`. |
| Stream mapper | `src/next/provider/openai-responses/openaiResponsesStreamMapper.ts` | `response.reasoning_summary_text.delta`, `response.output_item.done` | Delta events create `message.reasoning_raw_detail` and `message.reasoning_display_block`; reasoning output item `summary[]` is stored in a `reasoning_item` raw detail. | Streaming summary deltas display; final reasoning item summaries are not display blocks. |
| Artifact mapper | `src/next/provider/reasoningArtifact.ts` | `reasoning_item`, `summaryCount` | OpenAI `reasoning_item` becomes `opaque_reasoning` with `summaryCount`; summary text itself is not converted to a displayable summary artifact. | Summary array text is effectively diagnostic/opaque, not a user-visible summary. |
| UI summary extraction | `src/ui-app/app/appChatApp.logic.ts` | `extractReasoningTextFromDetails` | Extracts `reasoning.summary`, `thought_summary`, `thinking_summary`, `reasoning_summary`; does not extract `reasoning_item.summary[]`. | Raw `reasoning_item` summaries are not used as panel summary text. |
| Error handling | `src/shared/network/networkErrorEnvelope.ts`, `src/next/provider/openai-responses/openaiResponsesAdapter.ts`, `src/next/provider/streamEventBridge.ts` | `provider_access_unverified_or_forbidden`, `providerDiagnostic` | Handles organization/access verification signals and preserves redacted provider diagnostic JSON. | Access gate vs generic bad request is distinguishable; unsupported value remains provider bad request unless surfaced by provider code/message. |
| Diagnostics | `scripts/diagnostics/probe-openai-responses-o-reasoning-effort.cjs` | `CASES`, model filter | Existing probe is for `reasoning.effort`; it explicitly avoids GPT/pro and `/models`; it has no summary cases. | Reusable scaffold exists, but no summary probe. |

## Request Builder Status

Current ability to send `reasoning.summary`:

- Yes, when `config.generationParams` contains provider-native `reasoning: { summary: ... }`.
- Normal generation params path can produce this from `reasoningSummary` via `wirePath: ['reasoning', 'summary']`.

Current behavior by scenario:

| Scenario | Normal UI/resolver path | Direct provider-native payload path |
| --- | --- | --- |
| Summary unset | No `reasoning.summary`; no `reasoning` object from summary alone. | Depends on caller-provided `generationParams`. |
| Summary off | Use generation param mode `omit`; no `reasoning.summary` is sent. | Caller can send `reasoning.summary="none"`; builder currently passes it through. |
| Summary auto | Sent as `reasoning.summary="auto"` for OpenAI Responses if selected. | Same. |
| Summary concise/detailed | Sent as `reasoning.summary="concise"` / `"detailed"`. | Same. |
| Empty reasoning object | Normal mapper does not synthesize it. | `generationParams: { reasoning: {} }` can produce `reasoning: {}` because the builder applies raw allowed keys. |
| Effort and summary together | Both are merged into one `reasoning` object. | Same. |
| Effort auto | Resolver omits it; builder rejects direct `reasoning.effort="auto"`. | Direct `effort="auto"` throws in builder. |

Important distinction:

- `reasoningEffort=auto` is Starverse/provider-auto UI semantics and must be omitted from OpenAI wire.
- `reasoningSummary=auto` is currently treated as an OpenAI native wire value and is sent as `reasoning.summary="auto"`.

## UI And Config Status

Summary config exists:

- `reasoningSummary` is a first-class `GenerationParamKey`.
- It appears in the generic Generation Params editor when the selected provider/model capability marks it supported.
- It can be persisted in:
  - global settings via `generationParamsDefaults`
  - conversation/project metadata via `generationParamsOverride` / `generationParamsDefaults`

Model filtering:

- OpenAI Responses profile defaults `reasoningSummary` to unsupported.
- Model overrides enable summary only for models matched by `OPENAI_RESPONSES_REASONING_RULES`.
- There is no independent summary support rule; summary is currently coupled to effort-capable model families.

Naming and value risks:

- OpenAI profile enum values are `auto`, `concise`, `detailed`.
- Generic UI fallback enum includes `none`, which is not in the OpenAI profile enum.
- No migration currently removes old persisted `reasoningSummary: { mode: 'custom', value: 'none' }`; resolver should reject it under OpenAI profile, but direct provider-native payload can still pass `reasoning.summary="none"`.
- UI has `omit` mode, which is the current correct way to express summary off.

## Response Parsing Status

Streaming summary delta:

- `response.reasoning_summary_text.delta` is parsed.
- It emits:
  - raw detail: `{ type: 'reasoning_summary', text: delta }`
  - display block: text block with `semanticRole: 'summary'`
- Tests assert it never becomes visible answer text.

Summary done event:

- `response.reasoning_summary_text.done` is ignored. Current behavior relies on deltas for display and persistence.

Reasoning output item:

- `response.output_item.done` with `item.type === 'reasoning'` emits one raw detail:
  - `{ type: 'reasoning_item', id, summary: [{ text, type: 'summary_text' }], encrypted_content?, status? }`
- The `summary[]` text is not converted to `reasoning_summary` display blocks.
- `reasoningArtifactFromDetail()` maps `reasoning_item` to `opaque_reasoning` and records only `summaryCount`.
- `extractReasoningTextFromDetails()` does not read `reasoning_item.summary[]`.

Completed response:

- `response.completed.response.output` currently scans for `image_generation_call` output only.
- It does not extract final `reasoning` output items from `response.completed`.

Therefore:

- If OpenAI streams `response.reasoning_summary_text.delta`, Starverse should show/persist the summary.
- If OpenAI only returns summary in final `output[]` reasoning item `summary[]`, current code likely preserves it as opaque diagnostic raw detail but does not show it in the reasoning panel.

## Error Handling Status

Current handling:

- Organization/access verification messages are mapped to `provider_access_unverified_or_forbidden`.
- Provider HTTP errors preserve redacted raw diagnostic JSON through `providerDiagnostic`.
- UI can display structured `networkError` message and expose envelope details.
- `unsupported_value` is retained in provider code/message/diagnostic body.

Specific cases:

- Organization verification required:
  - Maps to `provider_access_unverified_or_forbidden`.
  - UI message uses localized “provider account or model access is not verified or permitted” copy.
- Unsupported value:
  - Preserved in raw provider diagnostic.
  - Unless the message matches access-gate terms, `400` falls back to `provider_bad_request`.
- Provider param:
  - Raw diagnostic JSON may include `param` such as `reasoning.summary`.
  - Structured `NetworkErrorEnvelope` does not currently expose provider `param` as a first-class field.

Current o3/o4-mini style errors:

- Access-gated o3 errors should show as access/unverified rather than generic model unavailable.
- Unsupported summary/effort values should show provider bad request, with raw provider JSON available in details.

## Test Status

Existing tests:

- Request builder:
  - Summary with effort maps to `reasoning`.
  - Summary alone maps to `{ reasoning: { summary: 'concise' } }`.
  - Effort auto is rejected as a wire value.
- Generation profiles:
  - OpenAI Responses model-specific effort gating is tested.
  - Non-reasoning `gpt-4.1-mini` has `reasoningSummary.supported === false`.
- Generation resolver:
  - OpenAI effort auto is provider-auto and omitted.
  - Unsupported effort on non-reasoning model is not sent.
- Stream mapper / adapter:
  - `response.reasoning_summary_text.delta` maps to reasoning raw detail.
  - Reasoning summary does not become visible answer text.
  - Full mocked o3 reasoning flow covers reasoning summary delta -> text -> completed.
- Diagnostics:
  - Existing o-series probe covers `reasoning.effort` only.
  - It forbids GPT/pro test models and avoids `/models`.

Missing tests:

- No request builder test for rejecting or omitting `reasoning.summary="none"`.
- No request builder test for rejecting empty `reasoning: {}`.
- No resolver/mapper test for `reasoningSummary=auto/concise/detailed` producing `reasoning.summary`.
- No resolver/mapper test for persisted `reasoningSummary=none` being rejected under OpenAI Responses profile.
- No stream mapper test that turns `response.output_item.done.item.summary[]` into displayable summary.
- No `response.completed.response.output[]` reasoning item extraction test.
- No real non-pro o-series summary-only probe.

## Direct Answers

Does Starverse currently support OpenAI Responses `reasoning.summary`?

- Partially. It can request `reasoning.summary` and parse streaming summary delta events, but support is not complete because final reasoning item summaries are not displayable and there is no independent summary capability/probe.

Does current code send `summary="none"`?

- Normal UI/profile path should not offer or send `summary="none"` for OpenAI Responses.
- Direct provider-native payload can still send `reasoning.summary="none"` because the builder type allows it and validates only `effort="auto"`.

Does current code send `summary="auto"` incorrectly?

- `reasoningSummary=auto` is currently treated as a native OpenAI Responses summary option and will be sent.
- This is separate from `reasoningEffort=auto`, which is correctly omitted.
- If the product decision becomes “summary auto means provider default/omit,” the mapper must change. Current implementation assumes `summary="auto"` is a valid requested summary mode.

Can current code generate empty `reasoning: {}`?

- Normal resolver/mapper path should not synthesize it.
- Direct provider-native payload can pass `generationParams: { reasoning: {} }`; builder will include it.

Will summary be parsed then discarded?

- Streaming `response.reasoning_summary_text.delta` is parsed and displayed.
- Final reasoning output item `summary[]` is preserved in raw detail but not displayed as summary text. From a user-visible perspective, that summary can be effectively dropped.

## Follow-Up Recommendations

Minimal implementation slice:

1. Add request-builder hardening:
   - Reject direct `generationParams.reasoning.summary="none"` for OpenAI Responses.
   - Reject direct empty `generationParams.reasoning = {}`.
   - Keep `reasoningEffort=auto` omitted and direct `effort="auto"` rejected.
2. Add an OpenAI Responses summary policy:
   - Separate `reasoning.summary` support from `reasoning.effort`.
   - Keep unknown/pro/GPT model behavior conservative until verified.
3. Add response mapper support for final summaries:
   - Convert `response.output_item.done.item.summary[]` to `reasoning_summary` raw detail/display block when it has text.
   - Extract `response.completed.response.output[]` reasoning items similarly.
4. Add focused tests:
   - Builder rejects `summary="none"` and empty `reasoning`.
   - Mapper displays output item summary arrays.
   - Resolver maps `reasoningSummary=auto/concise/detailed` and rejects stale `none`.
5. Optional real API probe:
   - Only after explicit authorization.
   - Limit to configured non-pro o-series models.
   - Do not test GPT or pro models.
   - Test only `reasoning.summary` variants: omitted, `auto`, `concise`, `detailed`, and negative `none`.
   - Use non-streaming if the goal is provider acceptance of request shape; use streaming only if verifying delta/event shape.

No immediate production code change was made in this investigation.

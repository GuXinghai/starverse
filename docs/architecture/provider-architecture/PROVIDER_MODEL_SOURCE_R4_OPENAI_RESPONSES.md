# Provider Model Source R4: OpenAI Responses Model Availability

Date: 2026-06-25

## Scope

R4 adds the third provider-level model availability sample: OpenAI official `/models` for the OpenAI Responses native provider. It continues the provider-aware availability route proven by DeepSeek and Gemini without introducing a provider registry, endpoint registry, RuntimeProviderRegistry, main model picker rewrite, secure store, or reasoning artifact service.

This phase keeps OpenAI Responses experimental text chat default-off and text-only. Model availability diagnostics are visible in Console and can apply a model id to the OpenAI Responses experimental chat setting only.

## Owner Decisions Preserved

- No default provider remains the product rule.
- OpenRouter remains an explicit first-class provider and keeps its existing catalog picker, Send Plan, and send path.
- OpenAI Responses is treated as a native provider, not Generic OpenAI-compatible live runtime.
- Generic OpenAI-compatible live remains deferred and fixture-only.
- R4 uses `openAIResponsesApiKey` through the main-process credential boundary.
- LocalEndpoint production native/compat profile split remains deferred; LocalEndpoint loopback-only constraints are unchanged.
- R4 does not implement reasoning artifact service, OpenAI reasoning item visibility, secure store, RuntimeProviderRegistry, EndpointRegistry, or ProviderRegistry.
- R4 does not expand OpenAI Responses experimental live chat capability.
- R4 does not modify DFC / file-pipeline closeout files.

## Official Sources Observed

Observed on 2026-06-25:

- OpenAI List Models: https://platform.openai.com/docs/api-reference/models/list
- OpenAI Responses Create: https://platform.openai.com/docs/api-reference/responses/create

The implementation records source documents with `observedAtMs`. Official docs facts are used as observed source metadata, not timeless product truth.

## `/models` Availability Seed

OpenAI official model source is called as:

- base URL: `https://api.openai.com/v1`
- path: `/models`
- auth: `Authorization: Bearer <OpenAI API key>`
- credential source: main-process `openAIResponsesApiKey`

The `/models` response is treated as availability and basic ownership seed only. The parser preserves only safe fields:

- `id`;
- `object`;
- `created`;
- `owned_by`.

Unknown fields and raw provider bodies are not returned to renderer. Invalid model entries are dropped with warnings.

OpenAI `/models` does not provide a complete Starverse capability catalog. It must not be used as evidence for context length, pricing, reasoning, tools, vision, file input, audio, structured output, or hosted-tool support.

## Curated Metadata

R4 keeps curated OpenAI metadata intentionally small:

- `gpt-4.1`;
- `gpt-4.1-mini`.

Curated metadata is marked as `starverse_curated_metadata` with `confidence: "curated"` and `observedAtMs`. It can supplement provider-reported capability hints and warnings for matching model ids, but it does not replace provider-reported availability, source, ownership, created time, or confidence.

Unknown provider-reported models are not given advanced capability claims by default.

## Consumers

R4 real consumers:

- `electron/ipc/openAIResponsesModelAvailabilityIpc.ts` exposes `openai-responses-models:list-availability`.
- `electron/preload.ts` exposes `openAIResponsesModels.listAvailability`.
- `src/ui-app/app/appChatApp.logic.ts` owns refresh state and calls the bridge.
- `src/ui-app/components/ChatSessionConsole.vue` renders source/confidence/observedAt, model rows, capability seed summary, warnings, and an explicit "Use model id" action.
- Tests cover parser, curated metadata merge, IPC credential boundary, UI diagnostics, preload bridge, and guardrails.

## Non-Goals

- OpenAI models are not written into the OpenRouter catalog namespace.
- OpenAI model availability is not published into the main `ModelPickerDialog`.
- No ModelPickerDialog rewrite is included.
- No Generic live path is enabled.
- No Chat Completions compatibility route is used as a substitute for Responses native route.
- No Anthropic or LocalEndpoint model source is implemented in R4.
- No reasoning artifact service or OpenAI reasoning item visible-text integration is added.
- No secure store is added.
- No RuntimeProviderRegistry, EndpointRegistry, ProviderRegistry, RuntimeManager, or EndpointManager is added.
- DFC / file-pipeline dirty files are unrelated and must not be mixed into R4.

## Next Source Order

Recommended provider model source order after R4:

1. Anthropic
2. LocalEndpoint

R5 should keep the same rule: add a provider model source with a concrete diagnostics or provider-status consumer before considering provider-aware model picker work.

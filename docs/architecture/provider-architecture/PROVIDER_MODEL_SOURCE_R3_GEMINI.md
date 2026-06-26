# Provider Model Source R3: Gemini / Google AI Studio Model Availability

Date: 2026-06-25

## Scope

R3 adds the second provider-level model availability sample after DeepSeek: Gemini / Google AI Studio official model source. It validates the `ProviderModelAvailability` direction across a native provider without introducing a provider registry, endpoint registry, RuntimeProviderRegistry, main model picker rewrite, secure store, or reasoning artifact service.

This phase keeps Google AI Studio experimental text chat default-off and text-only. Model availability diagnostics are visible in Console and can apply a model id to the Google AI Studio experimental chat setting only.

## Owner Decisions Preserved

- No default provider remains the product rule.
- OpenRouter remains an explicit first-class provider and keeps its existing catalog picker, Send Plan, and send path.
- Gemini / Google AI Studio is treated as a native provider source, not Generic OpenAI-compatible live runtime.
- The old `geminiApiKey` runtime remains deprecated-for-removal / migration-only and is not used by R3.
- R3 uses `googleAIStudioApiKey` through the main-process credential boundary.
- Generic OpenAI-compatible live remains deferred and fixture-only.
- LocalEndpoint production native/compat split remains deferred; LocalEndpoint loopback-only constraints are unchanged.
- R3 does not implement reasoning artifact service, Gemini thought visibility, secure store, RuntimeProviderRegistry, EndpointRegistry, or ProviderRegistry.
- R3 does not modify DFC / file-pipeline closeout files.

## Official Sources Observed

Observed on 2026-06-25:

- Gemini API Models: https://ai.google.dev/api/models
- Gemini API key docs: https://ai.google.dev/gemini-api/docs/api-key

The implementation records source documents with `observedAtMs`. Official docs facts are used as observed source metadata, not timeless product truth.

## `models.list` Availability Seed

Gemini official model source is called as:

- base URL: `https://generativelanguage.googleapis.com`
- path: `/v1beta/models`
- auth: `x-goog-api-key: <Google AI Studio API key>`
- credential source: main-process `googleAIStudioApiKey`

The official response is treated as availability and capability seed. The parser preserves only safe fields:

- `name`;
- `baseModelId`;
- `displayName`;
- `description`;
- `supportedGenerationMethods`;
- `inputTokenLimit`;
- `outputTokenLimit`;
- `nextPageToken`.

Unknown fields and raw provider bodies are not returned to renderer. Invalid model entries are dropped with warnings.

R3 implements bounded pagination through the model source client. If a provider response still has `nextPageToken` after the bounded page limit, the result includes a warning rather than following pagination indefinitely.

## Curated Metadata

R3 keeps curated Gemini metadata intentionally small:

- `gemini-2.5-flash`;
- `gemini-2.5-pro`.

Curated metadata is marked as `starverse_curated_metadata` with `confidence: "curated"` and `observedAtMs`. It can supplement provider-reported capability hints and warnings, but it does not replace provider-reported availability, source, or confidence.

## Consumers

R3 real consumers:

- `electron/ipc/googleAIStudioModelAvailabilityIpc.ts` exposes `google-ai-studio-models:list-availability`.
- `electron/preload.ts` exposes `googleAIStudioModels.listAvailability`.
- `src/ui-app/app/appChatApp.logic.ts` owns refresh state and calls the bridge.
- `src/ui-app/components/ChatSessionConsole.vue` renders source/confidence/observedAt, model rows, capability seed summary, warnings, and an explicit "Use model id" action.
- Tests cover parser, curated metadata merge, IPC credential boundary, UI diagnostics, preload bridge, and guardrails.

## Non-Goals

- Gemini models are not written into the OpenRouter catalog namespace.
- Gemini model availability is not published into the main `ModelPickerDialog`.
- No ModelPickerDialog rewrite is included.
- No old `geminiApiKey` runtime path is revived.
- No Generic live path is enabled.
- No OpenAI/Anthropic/LocalEndpoint model source is implemented in R3.
- No reasoning artifact service or Gemini thought visible-text integration is added.
- No secure store is added.
- No RuntimeProviderRegistry, EndpointRegistry, ProviderRegistry, RuntimeManager, or EndpointManager is added.
- DFC / file-pipeline dirty files are unrelated and must not be mixed into R3.

## Next Source Order

Recommended provider model source order after R3:

1. OpenAI
2. Anthropic
3. LocalEndpoint

R4 should keep the same rule: add a provider model source with a concrete diagnostics or provider-status consumer before considering provider-aware model picker work.

# Provider Model Source R5: Anthropic Messages Model Availability

Date: 2026-06-25

## Scope

R5 adds the fourth provider-level model availability sample: Anthropic official Models API for the Anthropic Messages native provider. It continues the provider-aware availability route proven by DeepSeek, Gemini, and OpenAI Responses without introducing a provider registry, endpoint registry, RuntimeProviderRegistry, main model picker rewrite, secure store, LocalEndpoint production split, or reasoning artifact service.

Anthropic Messages remains experimental text-only live chat. Model availability diagnostics are visible in Console and can apply a model id to the Anthropic Messages experimental chat setting only.

## Owner Decisions Preserved

- No default provider remains the product rule.
- OpenRouter remains an explicit first-class provider and keeps its existing catalog picker, Send Plan, and send path.
- Anthropic Messages is treated as a native provider, not Generic OpenAI-compatible live runtime.
- Generic OpenAI-compatible live remains deferred and fixture-only.
- R5 uses `anthropicApiKey` through the main-process credential boundary.
- LocalEndpoint production native/compat profile split remains deferred; LocalEndpoint loopback-only constraints are unchanged.
- R5 does not implement reasoning artifact service, Anthropic thinking/signature visible-text integration, secure store, RuntimeProviderRegistry, EndpointRegistry, or ProviderRegistry.
- R5 does not expand Anthropic Messages experimental live chat capability.
- R5 does not modify DFC / file-pipeline closeout files.

## Official Sources Observed

Observed on 2026-06-25:

- Anthropic List Models: https://platform.claude.com/docs/en/api/models/list
- Anthropic Messages API: https://platform.claude.com/docs/en/api/messages
- Anthropic model overview: https://docs.anthropic.com/en/docs/about-claude/models/overview

The implementation records source documents with `observedAtMs`. Official docs facts are used as observed source metadata, not timeless product truth.

## Models API Availability Seed

Anthropic official model source is called as:

- base URL: `https://api.anthropic.com/v1`
- path: `/models`
- auth: `x-api-key: <Anthropic API key>`
- API version header: `anthropic-version: 2023-06-01`
- credential source: main-process `anthropicApiKey`

The Models API response is treated as availability and provider-reported capability seed where fields are present. The parser preserves only safe fields:

- `id`
- `type`
- `display_name`
- `created_at`
- selected capability and token-limit fields when present

Unknown fields and raw provider bodies are not returned to renderer. Invalid model entries are dropped with warnings. Invalid dates are omitted with warnings.

## Capability Seed

R5 maps provider-reported capability hints only when present:

- text chat availability is true for valid Anthropic model records;
- image input, thinking, adaptive thinking, tool use, files, structured output, and citations are mapped from safe boolean capability fields if reported;
- missing capability fields degrade to `unknown`;
- `max_input_tokens` and `max_tokens` are copied only when safe positive integers.

This model source does not enable Anthropic tools, files, structured output, image input, or reasoning controls in the live chat route. Anthropic thinking and signature stream events remain reasoning-detail events and are not visible text.

## Curated Metadata

R5 keeps curated Anthropic metadata intentionally small:

- `claude-sonnet-4-5`
- `claude-opus-4-1`

Curated metadata is marked as `starverse_curated_metadata` with `confidence: "curated"` and `observedAtMs`. It can supplement provider-reported capability hints and warnings for matching model ids, but it does not replace provider-reported availability, source, created time, type, or confidence.

Unknown provider-reported models are not given advanced capability claims by default.

## Pagination

R5 implements bounded pagination for the Models API:

- first request uses `limit=100`;
- subsequent requests use `after_id` from the previous `last_id`;
- default page bound is 5 pages, capped to 10;
- truncated or incomplete pagination is surfaced as an availability warning.

## Consumers

R5 real consumers:

- `electron/ipc/anthropicModelAvailabilityIpc.ts` exposes `anthropic-models:list-availability`.
- `electron/preload.ts` exposes `anthropicModels.listAvailability`.
- `src/ui-app/app/appChatApp.logic.ts` owns refresh state and calls the bridge.
- `src/ui-app/components/ChatSessionConsole.vue` renders source/confidence/observedAt, model rows, capability seed summary, warnings, pagination warnings, and an explicit "Use model id" action.
- Tests cover parser, curated metadata merge, pagination, IPC credential boundary, UI diagnostics, preload bridge, and guardrails.

## Non-Goals

- Anthropic models are not written into the OpenRouter catalog namespace.
- Anthropic model availability is not published into the main `ModelPickerDialog`.
- No ModelPickerDialog rewrite is included.
- No Generic live path is enabled.
- No OpenAI-compatible compatibility route is used as a substitute for Anthropic Messages native route.
- No LocalEndpoint model source is implemented in R5.
- No reasoning artifact service or Anthropic thinking/signature visible-text integration is added.
- No secure store is added.
- No RuntimeProviderRegistry, EndpointRegistry, ProviderRegistry, RuntimeManager, or EndpointManager is added.
- DFC / file-pipeline dirty files are unrelated and must not be mixed into R5.

## Next Direction

After four provider samples, the recommended next step is a ProviderModelAvailability common-shape closeout before starting a reasoning artifact service. A closeout should compare DeepSeek, Gemini, OpenAI Responses, and Anthropic model-source shapes, then decide what is worth sharing before provider-aware model picker work.

# Provider Model Source R2: DeepSeek Official Model Availability

Date: 2026-06-21

## Scope

R2 adds the first non-OpenRouter provider model source foundation for DeepSeek official. It introduces a provider-level `ProviderModelAvailability` read model, a DeepSeek `/models` client, main-process IPC, Console diagnostics, and regression guards.

This is not a provider registry, endpoint registry, RuntimeProviderRegistry, model picker rewrite, secure store, or reasoning artifact service.

## Owner Decisions Preserved

- Starverse is not formally released, so no legacy user compatibility migration is required.
- No default provider remains the product rule.
- OpenRouter remains an explicit first-class provider and keeps the existing catalog picker path.
- DeepSeek official is a first-class provider/profile and does not use Generic OpenAI-compatible live runtime.
- Generic OpenAI-compatible live remains deferred and fixture-only.
- LocalEndpoint production native/compat profile split remains deferred; LocalEndpoint loopback-only constraints are unchanged.
- DeepSeek live chat capability is not expanded in this phase.
- Raw credentials remain behind the existing masked status / one-way update / renderer raw read-back blocked boundary.

## Official Sources Observed

Observed on 2026-06-21:

- DeepSeek List Models: https://api-docs.deepseek.com/api/list-models
- DeepSeek Models & Pricing: https://api-docs.deepseek.com/quick_start/pricing
- DeepSeek API introduction / auth: https://api-docs.deepseek.com/api/deepseek-api

The implementation records source documents with `observedAtMs` and confidence. The docs facts are not treated as timeless truth.

## `/models` Availability Seed

DeepSeek official `/models` is called as:

- base URL: `https://api.deepseek.com`
- path: `/models`
- auth: `Authorization: Bearer <DeepSeek API key>`
- credential source: main-process `deepSeekApiKey`

Renderer payloads cannot pass API keys, bearer tokens, authorization headers, or headers. Provider HTTP errors are returned as redacted safe messages.

The `/models` response is treated as availability seed only. It is parsed conservatively:

- root must contain `data[]`;
- model records require safe `id` and `object: "model"`;
- `owned_by` is copied if safe;
- unknown fields are ignored;
- invalid model entries are dropped with warnings;
- no raw provider body is returned to renderer.

## Curated Pricing And Alias Metadata

Because `/models` only reports basic model availability, Starverse seeds additional DeepSeek metadata from the Models & Pricing docs:

- `deepseek-v4-flash`
- `deepseek-v4-pro`
- deprecated aliases `deepseek-chat` and `deepseek-reasoner`

This metadata is marked as `deepseek_pricing_metadata` or `starverse_curated_metadata`, with `confidence: "curated"` and `observedAtMs`.

Alias warnings are surfaced in availability warnings. `deepseek-chat` and `deepseek-reasoner` are compatibility aliases deprecated at `2026-07-24T15:59:00.000Z`; they are not long-term primary models.

## Consumers

R2 real consumers:

- `electron/ipc/deepSeekModelAvailabilityIpc.ts` exposes `deepseek-models:list-availability`.
- `electron/preload.ts` exposes `deepSeekModels.listAvailability`.
- `src/ui-app/app/appChatApp.logic.ts` owns refresh state and calls the bridge.
- `src/ui-app/components/ChatSessionConsole.vue` renders source/confidence/observedAt, model rows, warnings, and an explicit "Use model id" action.
- Tests cover parser, metadata, IPC credential boundary, UI diagnostics, and guardrails.

## Non-Goals

- No DeepSeek models are written into the OpenRouter catalog namespace.
- No DeepSeek model availability is published into the main model picker.
- No ModelPickerDialog rewrite is included.
- No Generic live path is enabled.
- No OpenAI/Gemini/Anthropic/LocalEndpoint model source is implemented in R2.
- No reasoning artifact service or `reasoning_content` visible-text integration is added.
- No secure store is added.
- No RuntimeProviderRegistry, EndpointRegistry, ProviderRegistry, RuntimeManager, or EndpointManager is added.

## Next Source Order

Recommended provider model source order after R2:

1. Gemini
2. OpenAI
3. Anthropic
4. LocalEndpoint

R3 should keep the same rule: add provider model source consumers first, then consider a provider-aware model picker only after at least two non-OpenRouter sources prove the read model shape.

# ProviderModelAvailability Common Envelope C1

Date: 2026-06-25

## Scope

C1 stabilizes the internal read-model envelope shared by the four provider model availability samples:

- DeepSeek official
- Gemini / Google AI Studio
- OpenAI Responses
- Anthropic Messages

This is a type and diagnostics-shape closeout. It is not a provider registry, endpoint registry, RuntimeProviderRegistry, ModelSourceRegistry, model picker rewrite, secure store, LocalEndpoint model source, Send Plan capability integration, or reasoning artifact service.

## Envelope Role

The common envelope provides stable fields that UI, diagnostics, IPC tests, and provider status can rely on:

- `providerKey`
- `endpointId`
- `profileId`
- `nativeModelId`
- optional `displayName` and `description`
- `source`
- `confidence`
- `observedAtMs`
- `warnings`
- optional `provenance`
- optional conservative `capabilitySeed`
- optional `providerSpecific`

Provider-specific model source mappers still own provider documentation interpretation. The common layer does not parse provider payloads, infer provider semantics, or translate provider-specific capability dialects.

## Provenance

`ProviderModelAvailabilityProvenance` records where a model availability record came from:

- `sourceKind`
- `sourceLabel`
- `observedAtMs`
- optional `metadataVersion`
- `parserVersion`

The source modules map provider-local source names into common source kinds, for example:

- provider APIs -> `provider_api`
- provider docs/pricing pages -> `provider_docs`
- Starverse curated hints -> `starverse_curated_metadata`

Provider-local `source` strings remain unchanged so existing UI and tests keep their current behavior.

## Capability Seed

`capabilitySeed` remains a conservative seed. It is not Send Plan final capability and must not enable attachments, web search, tools, image generation, structured output, or reasoning controls for experimental providers.

The common envelope allows common capability names, but provider mappers are still responsible for deciding what a provider-reported field means. Missing fields degrade to unknown or are omitted. Unknown models should be valid with a minimal envelope and no advanced capability claims.

## Provider-Specific Fields

`providerSpecific` carries differences without forcing every provider into one capability graph:

- DeepSeek: `ownedBy`, pricing seed, alias/deprecation metadata, DeepSeek thinking mode hints.
- Gemini: provider model name, base model id, supported generation methods, token-limit source details, pagination token context.
- OpenAI Responses: `ownedBy`, `createdAtSec`, and `/models` basic ownership role.
- Anthropic: `modelType`, `createdAt`, pagination/truncation metadata, and raw capability keys.

For compatibility, current top-level fields used by Console diagnostics remain present. C1 adds `providerSpecific` and provenance rather than moving renderer-visible fields.

## Consumers

C1 is consumed by the four model source modules and the new envelope tests:

- `src/next/provider/modelAvailabilityEnvelope.ts`
- `src/next/provider/deepseek/deepSeekModelSource.ts`
- `src/next/provider/gemini/geminiModelSource.ts`
- `src/next/provider/openai-responses/openAIResponsesModelSource.ts`
- `src/next/provider/anthropic/anthropicModelSource.ts`

Console diagnostics keep provider-specific display logic. Main model picker and OpenRouter catalog are unchanged.

## Boundaries Preserved

- No provider availability enters the OpenRouter catalog namespace.
- No provider availability enters the main `ModelPickerDialog`.
- Generic OpenAI-compatible live remains deferred and fixture-only.
- LocalEndpoint model source remains deferred.
- OpenRouter Send Plan and send path remain unchanged.
- Credential boundaries remain main-process only for model availability fetches.
- No `EndpointRegistry`, `ProviderRegistry`, `RuntimeProviderRegistry`, `ModelSourceRegistry`, `RuntimeManager`, or `EndpointManager` placeholder is introduced.
- DFC / file-pipeline files are out of scope.

## Next Step

The next phase should require Owner direction. Two reasonable candidates are:

1. reasoning artifact service for native provider reasoning/thinking streams;
2. LocalEndpoint model source/probe read model.

C1 does not choose or start either path.

# Reasoning Artifact Service R6-A

Date: 2026-06-25

Scope: first-stage internal carrier for provider-native reasoning, thinking, thought, signature, and opaque reasoning stream details.

## Decisions

- R6-A introduces a small `ReasoningArtifact` read model and current-session collector.
- Reasoning artifacts are internal diagnostics and do not become assistant visible text.
- Reasoning artifacts are not injected back into prompts.
- Reasoning artifacts are not Send Plan capability facts and are not wired into Send Plan gating.
- Encrypted or opaque provider reasoning is represented as `opaque_reasoning` with an opaque reference, not readable text.
- Anthropic signature deltas are represented as `signature` artifacts and treated as provider metadata.
- First-stage UI is an assistant-message-local collapsed diagnostics block.
- R6-A stays in memory for the active renderer session. Long-term persistence, search, export, copy diagnostics, and a polished reasoning panel are deferred.

## Provider Mapping

- DeepSeek `reasoning_content` maps to `reasoning_text`.
- OpenAI Responses reasoning summary deltas map to `reasoning_summary`.
- OpenAI Responses reasoning text deltas map to `reasoning_text`.
- OpenAI Responses reasoning output items map to `opaque_reasoning`; encrypted content is not displayed.
- Anthropic `thinking_delta` maps to `thinking_text`.
- Anthropic `signature_delta` maps to `signature`; signature bytes are not displayed as human-readable thought.
- Gemini `part.thought === true` text maps to `thought_text`.
- OpenRouter `reasoning_details` maps to `reasoning_text`, `reasoning_summary`, `opaque_reasoning`, or conservative `provider_metadata` based on the existing detail type.

## Boundaries

- No RuntimeProviderRegistry, EndpointRegistry, ProviderRegistry, or ModelSourceRegistry is introduced.
- Generic live remains deferred.
- LocalEndpoint production and LAN support remain out of scope.
- OpenRouter catalog and main ModelPickerDialog are unchanged.
- Experimental provider live capabilities are not expanded.
- ProviderModelAvailability `capabilitySeed` remains separate from Send Plan final capability.
- DFC and file-pipeline files are not part of R6-A.

## Security Notes

- `providerSpecific` is sanitized before it enters a `ReasoningArtifact`.
- Secret-like keys and values such as Authorization, Bearer, API keys, x-api-key, credentials, and query secrets are dropped from artifact metadata.
- Opaque provider payloads are represented by stable opaque references and length metadata, not raw encrypted content.

## Deferred R6-B+ Work

- Persistence and lifecycle policy for artifacts.
- Dedicated reasoning diagnostics panel.
- Search/export/copy diagnostics actions.
- Provider-specific artifact grouping and richer provenance.
- Integration with future provider-aware model/runtime surfaces without registry placeholders.

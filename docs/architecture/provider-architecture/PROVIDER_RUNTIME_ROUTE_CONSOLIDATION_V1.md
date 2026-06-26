# Provider Runtime Route Consolidation v1

## Scope

This phase consolidates provider runtime text-send routing without changing user-visible behavior or provider capability.

The implementation adds `src/ui-app/app/providerRuntimeSendCoordinator.ts` as a small coordinator for:

- runtime text-send preflight using the existing `CurrentRuntimeSelection`, `RuntimeCapabilitySummaryLite`, `getRuntimeTextChatBlockReason`, and `resolveRuntimeTextSendRoute`;
- deterministic experimental text provider model, request id prefix, and reasoning artifact provider mapping;
- experimental text stream dispatch for DeepSeek, Google AI Studio, OpenAI Responses, Anthropic Messages, and LocalEndpoint.

It is not a registry, manager, endpoint service, model source service, or credential service.

## Behavior Preserved

- No default provider: unset runtime selection still blocks send before any provider stream starts.
- OpenRouter remains an explicit first-class runtime provider.
- OpenRouter send continues through the existing OpenRouter adapter, Send Plan, attachment/file/web/image/reasoning path, and credential-backed `legacy_store` wire source.
- DeepSeek, Google AI Studio, OpenAI Responses, Anthropic Messages, and LocalEndpoint remain experimental text-only routes.
- LocalEndpoint remains loopback-only through the existing LocalEndpoint live text chat implementation.
- Generic OpenAI-compatible live routing remains deferred and is not added to runtime dispatch.
- Reasoning artifacts remain collected from domain events and are not injected into visible text, prompt text, Send Plan, copy, search, or export.
- Secure credential store behavior is not owned by the coordinator. The coordinator never accepts or stores raw API keys.

## AppChatApp Responsibilities After v1

`appChatApp.logic.ts` still owns the UI/session-heavy parts of send:

- draft state and attachment state;
- conversation/branch creation and context building;
- OpenRouter Send Plan, confirmation, file preparation, and OpenRouter stream session creation;
- message metadata, reasoning request config, stream session persistence, and UI feedback;
- provider settings and model availability diagnostics state.

The route-specific provider text dispatch no longer lives as one branch per experimental provider in `onSend()`. `onSend()` asks the coordinator for runtime preflight and routes experimental text sends through one `sendExperimentalProviderTextChat()` path.

## Non-goals

- No `RuntimeProviderRegistry`, `EndpointRegistry`, `ProviderRegistry`, or `ModelSourceRegistry`.
- No Generic live runtime.
- No LocalEndpoint production split or LAN endpoint.
- No ModelPickerDialog changes.
- No OpenRouter catalog namespace changes.
- No Send Plan capability changes.
- No secure credential store redesign.
- No reasoning persistence/search/export changes.
- No expansion of experimental provider live capabilities.

## Validation Notes

The coordinator has direct unit coverage for:

- unset runtime selection blocking;
- explicit OpenRouter route preserving `openrouter_existing`;
- all five experimental providers preserving `experimental_text`;
- capability-lite text-only blocking;
- provider model/request/reasoning artifact mapping;
- stream dispatch to provider-specific experimental live adapters.

Existing AppChat and provider boundary tests remain responsible for full UI send behavior, credential exposure, OpenRouter path drift, Generic deferral, and LocalEndpoint loopback-only guardrails.

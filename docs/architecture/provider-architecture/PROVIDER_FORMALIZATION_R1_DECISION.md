# Provider Formalization R1 Decision

Date: 2026-06-21
Status: R1 implementation decision record
Scope: no default provider semantics, CurrentRuntimeSelection read model, capability-lite, and initial text send route resolver

Related:

- `STARVERSE_PROVIDER_ARCHITECTURE_CONTRACT.md`
- `STARVERSE_PROVIDER_TARGET_ARCHITECTURE.md`
- `STARVERSE_PROVIDER_EVOLUTION_PATH.md`
- `PROVIDER_EXPERIMENTAL_TEXT_CHAT_CLOSEOUT.md`
- `PROVIDER_C5_ENDPOINT_REGISTRY_INVESTIGATION.md`
- `PROVIDER_C6_LOCAL_ENDPOINT_INVESTIGATION.md`

## Owner Decisions

- Starverse is not formally released, so this phase does not preserve legacy default-provider behavior for old users.
- Formal product semantics have no default runtime provider. If no provider is selected, send is blocked before any runtime path is invoked.
- OpenRouter remains a first-class production provider and keeps its existing Send Plan, attachment, web search, reasoning, image-generation, stream, and legacy-store credential path, but it must be explicitly selected.
- Generic OpenAI-compatible live runtime remains deferred and fixture-only.
- LocalEndpoint R1 remains loopback-only. LAN, remote custom endpoint, enterprise gateway, credentials, and managed runtime behavior are out of scope.
- LocalEndpoint native profiles and local compatibility profiles are deferred to a later production package.
- OpenAI Responses, Google AI Studio, Anthropic Messages, DeepSeek official, and LocalEndpoint remain experimental text-only paths. This phase does not enable files, web, tools, reasoning controls, image generation, or structured output for them.
- Reasoning-first provider work remains a later route. R1 does not surface DeepSeek `reasoning_content`, Anthropic thinking/signatures, Gemini thought artifacts, or OpenAI Responses reasoning items as visible text.

## Implemented R1 Objects

- `CurrentRuntimeSelection` is a provider read model derived from explicit OpenRouter selection plus existing experimental localStorage flags.
- `RuntimeCapabilitySummaryLite` is a small capability summary consumed by send blocking and Console runtime status.
- `getRuntimeTextChatBlockReason()` is the unified text-chat block reason for unset selection, empty text, text-only experimental limitations, and reserved structured-output blocking.
- `resolveRuntimeTextSendRoute()` is the initial branch-consolidation entry for text send. It returns only:
  - `openrouter_existing`
  - `experimental_text`
  - `none`
- No production `EndpointRegistry`, `ProviderRegistry`, `RuntimeProviderRegistry`, `RuntimeManager`, or `EndpointManager` was introduced.

## Runtime Behavior

- Unset provider selection blocks send with: `请选择运行供应商和模型后再发送。`
- OpenRouter sends only when selected explicitly through Console runtime controls.
- Experimental provider flags remain mutually exclusive with OpenRouter and with each other.
- Generic OpenAI-compatible has no route from `resolveRuntimeTextSendRoute()`.
- LocalEndpoint still reaches live text chat only through the existing loopback validation boundary.

## Consumers

- Send path: `src/ui-app/app/appChatApp.logic.ts` reads `CurrentRuntimeSelection`, uses capability-lite for `getRuntimeTextChatBlockReason()`, then routes through `resolveRuntimeTextSendRoute()`.
- UI/Console: `src/ui-app/components/ChatSessionConsole.vue` displays the current runtime selection, capability-lite source, summary, warnings, and explicit OpenRouter provider control.
- Smoke: `scripts/smoke/provider-text-chat-smoke.mjs` explicitly selects OpenRouter before OpenRouter smoke sends.

## Deferred

- Secure store / OS keychain.
- Production endpoint/provider/runtime registries.
- Generic OpenAI-compatible live route.
- LocalEndpoint LAN, remote custom endpoint, enterprise gateway, credentials, and managed local runtime.
- Native-provider advanced reasoning/tool/file/web/image/structured-output production support.

# TP-01 — Legacy Identity and Runtime-dead Path Excision

Status: `complete`

## Goal

Remove every false or ambiguous compatible identity before introducing `openai_chat_compatible`. Leave the application with explicit provider selection and native/local providers intact, but no Generic fixture, compatible alias, default provider, `legacyOpenRouter` fallback, OpenRouter custom-endpoint identity, or LocalEndpoint-as-compatible coupling.

## Dependencies and prerequisite state

- First package; no implementation dependency.
- Start from a recorded branch/HEAD/status and preserve unrelated changes.
- Confirm the current source still contains the characterized legacy surfaces before deletion.

## Current evidence

- Generic config declares fixture-only: `src/next/provider/generic/genericEndpointConfig.ts:1-8`.
- Generic adapter declares no live support: `src/next/provider/generic/genericAdapter.ts:60-80`.
- Live route defers Generic: `src/next/provider/runtimeSelection.ts:445-465`.
- Default provider is OpenRouter: `src/next/provider/modelSelection.ts:8-13`.
- Providerless history becomes `legacyOpenRouter`: `src/ui-app/app/appChatApp.logic.ts:7800-7828`.
- OpenRouter custom identity is `openrouter-custom-legacy-store`: `electron/ipc/openRouterCredentialSettingsIpc.ts:55-103`.
- Orphan aliases exist in generation params and multimodal mappers: `src/next/generation-params/generationParamTypes.ts`, `src/next/multimodal/providerFileInputMapper.ts`.

## Production files and deletion scope

Delete the complete `src/next/provider/generic/` implementation and tests:

- `genericEndpointConfig*`
- `genericEndpointDescriptor*`
- `genericAdapter*`
- `genericRequestBuilder*`
- `genericSseDecoder*`
- `genericOpenAICompatibleStreamMapper*`

Remove only the compatible aliases/branches from:

- `src/next/provider/runtimeSelection.ts` and tests.
- `src/next/provider/modelSelection.ts` and consumers.
- `src/next/generation-params/generationParamTypes.ts`, `generationParamProfiles.ts`, Generic profile and tests.
- `src/next/multimodal/providerRuntimeContentBlocks.ts`, `providerFileInputMapper.ts` and compatibility-only tests.
- `electron/ipc/openRouterCredentialSettingsIpc.ts`, `electron/electron-env.d.ts`, Settings UI/tests for custom legacy endpoint metadata.
- `src/ui-app/app/appChatApp.logic.ts`, `chatSessionConfig.ts`, composer/picker/console code that substitutes OpenRouter for an unset provider.
- `src/next/provider/providerEndpointRegistryBaseline.test.ts` and other string/source guards that exist only to freeze the old absence/fixture architecture.

Do not delete OpenRouter official, LocalEndpoint, LM Studio, Ollama, or native provider implementations.

## Schema, config and data impact

- No new schema in this package.
- Stop reading/writing `openRouterBaseUrl` as a custom compatible identity; physical key removal is executed by TP-16 reset.
- Deserialization must represent missing provider/model as explicit `unset`, not OpenRouter.
- Old providerless/legacy rows become intentionally unroutable; do not delete them yet and do not add fallback.
- Record reset predicates for TP-16 without implementing reset here.

## Core invariants

- No `generic*` compatible provider identity remains in production unions or mappers.
- No default provider exists.
- Missing/unknown historical provider identity fails closed with a readable unavailable-route state.
- OpenRouter official remains a native explicit selection, never the default for absent data.
- LocalEndpoint remains independent and unchanged.
- The package does not introduce the new compatible provider yet.

## Implementation steps

1. Add characterization assertions for explicit-unset behavior and native-provider preservation.
2. Remove the Generic directory and all imports/branches.
3. Remove `generic_openai_compatible` generation/multimodal aliases rather than renaming them.
4. Remove `Generic … deferred` unreachable fallback and make unknown runtime keys a typed invalid state.
5. Remove `DEFAULT_CHAT_PROVIDER_ID`; update config/UI/runtime callers to require explicit provider or unset state.
6. Remove `legacyOpenRouter` reconstruction and return an unroutable legacy marker/error without provider substitution.
7. Remove OpenRouter custom endpoint metadata/UI/config behavior while preserving official credential behavior.
8. Delete compatibility-only tests/source guards and replace only with explicit identity invariants.
9. Run full searches proving the forbidden identities are absent outside historical docs/this plan.

## Tests and gates

- Focused runtime selection, chat session config, model selection, composer/picker and OpenRouter credential tests.
- `npx tsc --noEmit --pretty false`
- `npx vue-tsc --noEmit`
- `npm run gate:network-egress`
- `git diff --check`
- Negative searches for `streamViaGeneric`, `GenericEndpointConfig`, `decodeGenericSSE`, `generic_openai_compatible`, `legacyOpenRouter`, `DEFAULT_CHAT_PROVIDER_ID`, `openrouter-custom-legacy-store` in production/tests.

## Acceptance criteria

- Repository compiles and focused UI/runtime tests pass with explicit unset behavior.
- No Generic fixture or duplicate mapper remains.
- No old compatible alias/default/fallback is executable or test-supported.
- Native OpenRouter and independent LocalEndpoint behavior remain covered.
- Old rows are not silently rerouted; reset work is deferred explicitly to TP-16.

## Prohibitions

- Do not rename Generic files into the new provider.
- Do not add a temporary compatible provider key or bridge.
- Do not migrate providerless history to OpenRouter or the new provider.
- Do not refactor LocalEndpoint.
- Do not delete user data in this package.

## Suggested commit

`refactor(provider): remove legacy compatible identities and fallbacks`

## Stable contract for the next package

Provider selection has an explicit `unset` state; native/local identities are unambiguous; all old compatible implementation names and fallback behavior are absent; TP-02 can introduce the canonical domain without coexistence.

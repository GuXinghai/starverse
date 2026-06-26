# Secure Credential Store v1

Status: implemented for provider credential boundary.

Date: 2026-06-26

Owner decision: Starverse is not released, so legacy provider secret compatibility is not required. Existing legacy provider secret configuration may be reset. Secure Credential Store v1 is the only formal provider secret source.

## Scope

Secure Credential Store v1 moves provider API key ownership into a main-process credential service for:

- OpenRouter
- DeepSeek official
- Google AI Studio
- OpenAI Responses
- Anthropic Messages

This is not a provider registry, endpoint registry, model source registry, account sync system, cloud key store, or secure-store abstraction for renderer code.

## Storage Strategy

The main process creates `providerCredentialService` from `electron/credentials/providerCredentialService.ts`.

Primary storage uses Electron `safeStorage`:

- store key prefix: `providerCredentials.v1.`
- one record per provider
- encrypted value stored as base64 ciphertext
- renderer generic store IPC blocks both legacy key names and the secure credential record prefix

If `safeStorage` is unavailable, v1 permits a controlled plaintext fallback record under the same secure-store namespace. Fallback status is explicit:

- `source: 'plaintext_fallback'`
- `backend: 'plaintext_fallback'`
- warning shown in SettingsPanel

This fallback preserves current app usability on platforms where OS storage cannot be used, but it is explicit credential-store backing, not a legacy runtime fallback. It is a known risk and should be revisited before production hardening.

## Migration Strategy

Legacy provider API keys remain migration-readable:

- `openRouterApiKey`
- `deepSeekApiKey`
- `googleAIStudioApiKey`
- `openAIResponsesApiKey`
- `anthropicApiKey`

When a secure record is absent and a legacy key exists, the service attempts migration on status/runtime read:

1. Write secure `providerCredentials.v1.<provider>` record.
2. Delete the legacy API key after successful write.
3. Return masked configured status to renderer.

If migration write fails, runtime read does not return the legacy raw key. The service returns a safe credential unavailable error and asks the user to re-enter the provider API key. The legacy key is not used as a long-term runtime fallback.

OpenRouter custom `openRouterBaseUrl` is endpoint configuration, not API key material; it remains in the existing store key and is preserved by OpenRouter credential clear.

OpenRouter catalog sync may keep legacy-shaped credential ref names for compatibility with the existing catalog scope code. Those names are naming compatibility only; backing credential material must come through `ProviderCredentialService`, not a legacy secret fallback.

## Runtime Consumers

The service is consumed by:

- provider credential settings IPC: status, update, clear
- provider model availability IPC: DeepSeek, Google AI Studio, OpenAI Responses, Anthropic
- provider text chat IPC: DeepSeek, Google AI Studio, OpenAI Responses, Anthropic
- OpenRouter stream bridge, accepting only service-backed `credentialSource: 'legacy_store'`
- OpenRouter catalog sync startup / manual sync credential reader, with legacy-shaped names backed by the service
- SettingsPanel warning display for fallback/migration-risk states

Renderer preload APIs remain narrow and unchanged in shape: update, clear, status, and provider-specific runtime actions. Renderer still cannot read raw provider keys.

## Redaction Boundary

`electron/credentials/providerCredentialRedaction.ts` covers common credential-bearing text:

- `sk-...`
- Bearer tokens
- `Authorization`
- `x-api-key`
- provider raw error body text

Provider adapters and IPCs continue returning static safe errors for auth/provider failures. Raw `Authorization`, `Bearer`, `x-api-key`, and API key material must not be returned through diagnostics, preload, or generic store IPC.

## Non-Goals

Secure Credential Store v1 does not:

- add RuntimeProviderRegistry, EndpointRegistry, ProviderRegistry, or ModelSourceRegistry
- enable Generic live
- change LocalEndpoint production status
- rewrite ModelPickerDialog
- change OpenRouter catalog namespace or Send Plan capability
- persist reasoning artifacts
- implement account sync, portable-mode policy, or cloud keys

## Rollback Plan

The service is isolated behind main-process IPC wiring. A rollback can:

1. Revert service injection in IPC registration and OpenRouter stream/catalog readers.
2. Leave renderer blocklist additions in place; blocking extra secure keys is safe.
3. Keep legacy API key read paths available only if restoring the previous IPC implementations for a local recovery build.

Do not delete secure credential records during rollback unless an explicit migration rollback tool is added.

## Known Limitations

- Plaintext fallback is explicitly marked and warned, but still stores secret material in app config.
- Migration is lazy: it runs on status/runtime read, not as a standalone startup job.
- OpenRouter catalog credential ref names remain legacy-shaped for catalog compatibility, while backing must be service-managed.

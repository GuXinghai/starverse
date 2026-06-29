/**
 * Generic OpenAI-compatible endpoint configuration boundary — fixture-only.
 *
 * Separates non-secret endpoint config from secret-bearing credential material.
 * Resolves into the existing GenericEndpointDescriptor consumed by the adapter.
 *
 * No endpoint registry, no settings, no secure store, no UI, no live API.
 */

import {
  isSecretLikeCredentialFieldName,
} from '@/next/provider/credentials/providerCredential'
import {
  resolveProviderCredential,
  validateProviderCredentialRef,
  type ProviderCredentialRef,
  type ProviderCredentialResolver,
} from '@/next/provider/credentials/providerCredentialResolver'
import {
  safeProviderCredentialMetadataFromRef,
  type SafeProviderCredentialMetadata,
} from '@/next/provider/credentials/providerCredentialMetadata'
import {
  GENERIC_OPENAI_COMPAT_CHAT_COMPLETIONS_PROFILE_ID,
  buildChatCompletionsUrl,
  validateGenericEndpointDescriptor,
  validateCapabilityOverride,
  normalizeGenericImageInputProfile,
  type GenericEndpointDescriptor,
  type DescriptorValidationError,
  type GenericRuntimeCapability,
  type GenericImageInputProfile,
} from '@/next/provider/generic/genericEndpointDescriptor'

// ---------------------------------------------------------------------------
// Credential reference — non-secret pointer
// ---------------------------------------------------------------------------

export type GenericCredentialRef = ProviderCredentialRef

// ---------------------------------------------------------------------------
// Capability override — optional conservative override
// ---------------------------------------------------------------------------

/**
 * Capability override — maps GenericRuntimeCapability fields to optional booleans.
 * Allows both enabling and disabling conservative features via override.
 */
export type GenericCapabilityOverride = {
  [K in keyof GenericRuntimeCapability]?: boolean
}

// ---------------------------------------------------------------------------
// Endpoint config — non-secret boundary
// ---------------------------------------------------------------------------

export type GenericEndpointConfig = Readonly<{
  endpointId: string
  displayName?: string
  profileId: typeof GENERIC_OPENAI_COMPAT_CHAT_COMPLETIONS_PROFILE_ID
  baseUrl: string
  model: string
  credentialRef: GenericCredentialRef
  imageInputProfile?: GenericImageInputProfile
  capabilityOverride?: GenericCapabilityOverride
}>

export type GenericEndpointFixtureMetadata = Readonly<{
  kind: 'generic_endpoint_fixture'
  fixtureOnly: true
  rendererSafe: true
  rendererVisible: false
  providerId: 'generic'
  endpointKind: 'remote_openai_compatible'
  locality: 'remote'
  endpointId: string
  displayName: string | undefined
  profileId: typeof GENERIC_OPENAI_COMPAT_CHAT_COMPLETIONS_PROFILE_ID
  baseUrl: string
  model: string
  credentialRef: GenericCredentialRef
  capability: GenericRuntimeCapability
  imageInputProfile: GenericImageInputProfile
}>

// ---------------------------------------------------------------------------
// Credential resolver — injected externally
// ---------------------------------------------------------------------------

export type ResolveGenericCredential = ProviderCredentialResolver

// ---------------------------------------------------------------------------
// Config validation errors
// ---------------------------------------------------------------------------

export type ConfigValidationError = Readonly<{
  code:
    | 'invalid_endpoint_id'
    | 'invalid_profile'
    | 'invalid_base_url'
    | 'invalid_model'
    | 'invalid_credential_ref'
    | 'credential_resolution_failed'
    | 'blocked_capability_override'
    | 'secret_like_field_rejected'
    | 'url_scheme_not_allowed'
    | 'url_has_userinfo'
    | 'url_has_query'
    | 'url_has_fragment'
    | 'invalid_image_input_profile'
  message: string
}>

// ---------------------------------------------------------------------------
// Renderer-safe metadata
// ---------------------------------------------------------------------------

export type SafeGenericEndpointMetadata = Readonly<{
  endpointId: string
  displayName: string | undefined
  profileId: typeof GENERIC_OPENAI_COMPAT_CHAT_COMPLETIONS_PROFILE_ID
  maskedBaseUrl: string
  model: string
  credentialPresent: boolean
  credential: SafeProviderCredentialMetadata
  capability: GenericRuntimeCapability
  imageInputProfile: GenericImageInputProfile
}>

export type SafeGenericEndpointMetadataOptions = Readonly<{
  credential?: SafeProviderCredentialMetadata
}>

function rejectSecretLikeFields(
  input: Record<string, unknown>,
): ConfigValidationError | null {
  for (const key of Object.keys(input)) {
    if (isSecretLikeCredentialFieldName(key)) {
      return {
        code: 'secret_like_field_rejected',
        message: `Config must not contain secret-like field. Use credentialRef instead.`,
      }
    }
  }
  return null
}

function genericConservativeCapability(): GenericRuntimeCapability {
  return {
    textChat: true,
    basicMessages: true,
    streamingText: true,
    basicHttpError: true,
    samplingParams: true,
    tools: false,
    functionCalling: false,
    files: false,
    pdf: false,
    vision: false,
    multimodal: false,
    reasoning: false,
    webSearch: false,
    structuredOutput: false,
    imageGeneration: false,
    audio: false,
    video: false,
    parallelToolCalls: false,
    providerHostedTools: false,
    usageFinalGuaranteed: false,
  }
}

function applyValidatedCapabilityOverride(
  capability: GenericRuntimeCapability,
  override: GenericCapabilityOverride | undefined,
): GenericRuntimeCapability {
  if (!override) return capability

  const merged = { ...capability } as Record<string, boolean>
  for (const [key, value] of Object.entries(override)) {
    if (typeof value === 'boolean' && key in merged) {
      merged[key] = value
    }
  }
  return merged as GenericRuntimeCapability
}

/**
 * Fixture-only endpoint metadata shape pressure for future C5 work.
 *
 * This is not a production endpoint registry record and is not exposed to UI.
 * It validates the same non-secret config boundary Generic fixtures already
 * consume: endpoint id, profile id, non-secret base URL, model, credentialRef,
 * and conservative capabilities.
 */
export function toGenericEndpointFixtureMetadata(
  config: GenericEndpointConfig,
): GenericEndpointFixtureMetadata | ConfigValidationError {
  if (!config || typeof config !== 'object') {
    return { code: 'invalid_endpoint_id', message: 'Endpoint ID must be a non-empty string.' }
  }

  const secretError = rejectSecretLikeFields(config as Record<string, unknown>)
  if (secretError) return secretError

  if (typeof config.endpointId !== 'string' || config.endpointId.trim().length === 0) {
    return { code: 'invalid_endpoint_id', message: 'Endpoint ID must be a non-empty string.' }
  }

  if (config.profileId !== GENERIC_OPENAI_COMPAT_CHAT_COMPLETIONS_PROFILE_ID) {
    return { code: 'invalid_profile', message: 'Unsupported Generic endpoint profile id.' }
  }

  const urlOrError = buildChatCompletionsUrl(config.baseUrl)
  if (typeof urlOrError !== 'string') {
    return mapDescriptorError(urlOrError)
  }

  if (typeof config.model !== 'string' || config.model.trim().length === 0) {
    return { code: 'invalid_model', message: 'Model must be a non-empty string' }
  }

  const credentialRef = validateProviderCredentialRef(config.credentialRef)
  if ('code' in credentialRef) {
    return { code: 'invalid_credential_ref', message: credentialRef.message }
  }

  if (config.capabilityOverride) {
    const capError = validateCapabilityOverride(config.capabilityOverride as Record<string, unknown>)
    if (capError) {
      return { code: 'blocked_capability_override', message: capError.message }
    }
  }

  const imageInputProfile = normalizeGenericImageInputProfile(config.imageInputProfile)
  if (!imageInputProfile) {
    return { code: 'blocked_capability_override', message: 'Unsupported Generic image input profile.' }
  }

  return {
    kind: 'generic_endpoint_fixture',
    fixtureOnly: true,
    rendererSafe: true,
    rendererVisible: false,
    providerId: 'generic',
    endpointKind: 'remote_openai_compatible',
    locality: 'remote',
    endpointId: config.endpointId.trim(),
    displayName: config.displayName,
    profileId: GENERIC_OPENAI_COMPAT_CHAT_COMPLETIONS_PROFILE_ID,
    baseUrl: config.baseUrl.trim(),
    model: config.model.trim(),
    credentialRef,
    capability: applyValidatedCapabilityOverride(genericConservativeCapability(), config.capabilityOverride),
    imageInputProfile,
  }
}

// ---------------------------------------------------------------------------
// URL host masking
// ---------------------------------------------------------------------------

function maskUrlHost(rawBaseUrl: string): string {
  try {
    const url = new URL(rawBaseUrl.trim())
    const host = url.hostname
    // Mask everything except first and last char of hostname
    if (host.length <= 2) return `${url.protocol}//${host}`
    const masked = host[0] + '***' + host[host.length - 1]
    const port = url.port ? `:${url.port}` : ''
    return `${url.protocol}//${masked}${port}`
  } catch {
    return '[invalid-url]'
  }
}

// ---------------------------------------------------------------------------
// Resolve config into descriptor
// ---------------------------------------------------------------------------

/**
 * Validate a GenericEndpointConfig and resolve it into a GenericEndpointDescriptor.
 *
 * Steps:
 * 1. Reject secret-like fields in config
 * 2. Validate non-secret config (endpointId, profileId, baseUrl, model)
 * 3. Validate capability override if present
 * 4. Resolve credential through injected resolver
 * 5. Reuse existing descriptor validation to produce the descriptor
 *
 * Returns the descriptor or a safe error. Never exposes raw tokens in errors.
 */
export function resolveGenericEndpointDescriptor(
  config: GenericEndpointConfig,
  resolveCredential: ResolveGenericCredential,
): GenericEndpointDescriptor | ConfigValidationError {
  // 1. Reject secret-like fields (defensive — config type should not have them,
  //    but runtime input may be unsafe)
  if (typeof config === 'object' && config !== null) {
    const secretError = rejectSecretLikeFields(config as Record<string, unknown>)
    if (secretError) return secretError
  }

  // 2. Validate endpointId
  if (typeof config.endpointId !== 'string' || config.endpointId.trim().length === 0) {
    return { code: 'invalid_endpoint_id', message: 'Endpoint ID must be a non-empty string.' }
  }

  // 3. Validate capability override
  if (config.capabilityOverride) {
    const capError = validateCapabilityOverride(config.capabilityOverride as Record<string, unknown>)
    if (capError) {
      return { code: 'blocked_capability_override', message: capError.message }
    }
  }

  const imageInputProfile = normalizeGenericImageInputProfile(config.imageInputProfile)
  if (!imageInputProfile) {
    return { code: 'invalid_image_input_profile', message: 'Unsupported Generic image input profile.' }
  }

  // 4. Resolve credential through injected provider-layer resolver
  const credentialResolution = resolveProviderCredential(config.credentialRef, resolveCredential)
  if (!credentialResolution.ok) {
    const code = credentialResolution.error.code === 'invalid_credential_ref'
      ? 'invalid_credential_ref'
      : 'credential_resolution_failed'
    return { code, message: credentialResolution.error.message }
  }

  // 5. Reuse existing descriptor validation (profileId, baseUrl, model, credential)
  const descriptor = validateGenericEndpointDescriptor({
    profileId: config.profileId,
    baseUrl: config.baseUrl,
    model: config.model,
    apiKey: credentialResolution.credential.token,
    imageInputProfile,
  })
  if ('code' in descriptor) {
    return mapDescriptorError(descriptor)
  }

  // Apply capability override if provided (already validated above)
  if (config.capabilityOverride) {
    const merged = { ...descriptor.capability } as Record<string, boolean>
    for (const [key, value] of Object.entries(config.capabilityOverride)) {
      if (typeof value === 'boolean' && key in merged) {
        merged[key] = value
      }
    }
    return {
      ...descriptor,
      capability: merged as GenericRuntimeCapability,
    }
  }

  return descriptor
}

function mapDescriptorError(err: DescriptorValidationError): ConfigValidationError {
  return { code: err.code as ConfigValidationError['code'], message: err.message }
}

// ---------------------------------------------------------------------------
// Safe metadata helper
// ---------------------------------------------------------------------------

/**
 * Produce renderer-safe metadata from a GenericEndpointConfig.
 *
 * Never exposes raw tokens, bearer values, Authorization strings,
 * URL userinfo, or raw credential material.
 *
 * Only applies validated capability overrides. Malformed overrides
 * are silently ignored to prevent unsafe metadata claims.
 */
export function toSafeGenericEndpointMetadata(
  config: GenericEndpointConfig,
  options?: SafeGenericEndpointMetadataOptions,
): SafeGenericEndpointMetadata {
  // Conservative default
  let capability = genericConservativeCapability()

  // Only apply override if it passes validation (fail-closed)
  if (config.capabilityOverride) {
    const capError = validateCapabilityOverride(config.capabilityOverride as Record<string, unknown>)
    if (!capError) {
      capability = applyValidatedCapabilityOverride(capability, config.capabilityOverride)
    }
    // Malformed overrides are silently ignored — conservative defaults remain
  }

  const credential = options?.credential ?? safeProviderCredentialMetadataFromRef(config.credentialRef)

  return {
    endpointId: config.endpointId,
    displayName: config.displayName,
    profileId: config.profileId,
    maskedBaseUrl: maskUrlHost(config.baseUrl),
    model: config.model,
    credentialPresent: credential.present,
    credential,
    capability,
    imageInputProfile: normalizeGenericImageInputProfile(config.imageInputProfile) ?? 'text_only',
  }
}

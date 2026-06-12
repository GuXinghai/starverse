/**
 * Generic OpenAI-compatible endpoint configuration boundary — fixture-only.
 *
 * Separates non-secret endpoint config from secret-bearing credential material.
 * Resolves into the existing GenericEndpointDescriptor consumed by the adapter.
 *
 * No endpoint registry, no settings, no secure store, no UI, no live API.
 */

import {
  type ProviderCredential,
  type CredentialError,
  isCredentialError,
} from '@/next/provider/credentials/providerCredential'
import {
  GENERIC_OPENAI_COMPAT_CHAT_COMPLETIONS_PROFILE_ID,
  validateGenericEndpointDescriptor,
  validateCapabilityOverride,
  type GenericEndpointDescriptor,
  type DescriptorValidationError,
  type GenericRuntimeCapability,
} from '@/next/provider/generic/genericEndpointDescriptor'

// ---------------------------------------------------------------------------
// Credential reference — non-secret pointer
// ---------------------------------------------------------------------------

export type GenericCredentialRef = Readonly<{
  kind: 'credential_ref'
  id: string
}>

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
  capabilityOverride?: GenericCapabilityOverride
}>

// ---------------------------------------------------------------------------
// Credential resolver — injected externally
// ---------------------------------------------------------------------------

export type ResolveGenericCredential = (
  ref: GenericCredentialRef,
) => ProviderCredential | CredentialError

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
  capability: GenericRuntimeCapability
}>

// ---------------------------------------------------------------------------
// Secret-like field detection
// ---------------------------------------------------------------------------

const SECRET_LIKE_FIELDS: ReadonlySet<string> = new Set([
  'apiKey',
  'api_key',
  'token',
  'accessToken',
  'access_token',
  'bearerToken',
  'bearer_token',
  'authToken',
  'auth_token',
  'authorization',
  'secret',
  'secretKey',
  'secret_key',
  'password',
  'privateKey',
  'private_key',
])

function rejectSecretLikeFields(
  input: Record<string, unknown>,
): ConfigValidationError | null {
  for (const key of SECRET_LIKE_FIELDS) {
    if (key in input) {
      return {
        code: 'secret_like_field_rejected',
        message: `Config must not contain secret-like field "${key}". Use credentialRef instead.`,
      }
    }
  }
  return null
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

  // 4. Resolve credential through injected resolver
  if (!config.credentialRef || config.credentialRef.kind !== 'credential_ref') {
    return { code: 'invalid_credential_ref', message: 'Credential reference is required and must be a credential_ref.' }
  }
  if (typeof config.credentialRef.id !== 'string' || config.credentialRef.id.trim().length === 0) {
    return { code: 'invalid_credential_ref', message: 'Credential reference id must be a non-empty string.' }
  }

  const credential = resolveCredential(config.credentialRef)
  if (isCredentialError(credential)) {
    return { code: 'credential_resolution_failed', message: 'Credential could not be resolved.' }
  }

  // 5. Reuse existing descriptor validation (profileId, baseUrl, model, credential)
  const descriptor = validateGenericEndpointDescriptor({
    profileId: config.profileId,
    baseUrl: config.baseUrl,
    model: config.model,
    apiKey: credential.token,
  })
  if ('code' in descriptor) {
    return mapDescriptorError(descriptor)
  }

  // Apply capability override if provided
  if (config.capabilityOverride) {
    return {
      ...descriptor,
      capability: { ...descriptor.capability, ...config.capabilityOverride } as GenericRuntimeCapability,
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
 */
export function toSafeGenericEndpointMetadata(
  config: GenericEndpointConfig,
  _validationState?: 'valid' | 'invalid',
): SafeGenericEndpointMetadata {
  // Use descriptor capability if available, otherwise conservative default
  let capability: GenericRuntimeCapability = {
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

  if (config.capabilityOverride) {
    capability = { ...capability, ...config.capabilityOverride } as GenericRuntimeCapability
  }

  return {
    endpointId: config.endpointId,
    displayName: config.displayName,
    profileId: config.profileId,
    maskedBaseUrl: maskUrlHost(config.baseUrl),
    model: config.model,
    credentialPresent: config.credentialRef != null,
    capability,
  }
}

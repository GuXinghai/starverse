/**
 * Generic OpenAI-compatible endpoint descriptor — provider-local fixture boundary.
 *
 * Expresses the minimum Phase 3 custom OpenAI-compatible shape:
 * profile id, base URL, model, credential, conservative capability.
 *
 * No endpoint registry, no settings, no secure store, no UI, no live API.
 * This is a fixture adapter hardening boundary only.
 */

import {
  type ProviderCredential,
  createBearerCredential,
  isCredentialError,
} from '@/next/provider/credentials/providerCredential'

// ---------------------------------------------------------------------------
// Profile ID
// ---------------------------------------------------------------------------

export const GENERIC_OPENAI_COMPAT_CHAT_COMPLETIONS_PROFILE_ID =
  'generic_openai_compat_chat_completions' as const

// ---------------------------------------------------------------------------
// Capability — conservative defaults
// ---------------------------------------------------------------------------

export type GenericRuntimeCapability = Readonly<{
  textChat: true
  basicMessages: true
  streamingText: true
  basicHttpError: true
  samplingParams: true
  tools: false
  functionCalling: false
  files: false
  pdf: false
  vision: false
  multimodal: false
  reasoning: false
  webSearch: false
  structuredOutput: false
  imageGeneration: false
  audio: false
  video: false
  parallelToolCalls: false
  providerHostedTools: false
  usageFinalGuaranteed: false
}>

const DEFAULT_CAPABILITY: GenericRuntimeCapability = {
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

// Features that must remain false in this conservative fixture
const BLOCKED_FEATURES: ReadonlySet<string> = new Set([
  'tools',
  'functionCalling',
  'files',
  'pdf',
  'vision',
  'multimodal',
  'reasoning',
  'webSearch',
  'structuredOutput',
  'imageGeneration',
  'audio',
  'video',
  'parallelToolCalls',
  'providerHostedTools',
  'usageFinalGuaranteed',
])

// ---------------------------------------------------------------------------
// Descriptor type
// ---------------------------------------------------------------------------

export type GenericEndpointDescriptor = Readonly<{
  profileId: typeof GENERIC_OPENAI_COMPAT_CHAT_COMPLETIONS_PROFILE_ID
  baseUrl: string
  model: string
  credential: ProviderCredential
  capability: GenericRuntimeCapability
}>

// ---------------------------------------------------------------------------
// Validation errors
// ---------------------------------------------------------------------------

export type DescriptorValidationError = Readonly<{
  code:
    | 'invalid_profile'
    | 'invalid_base_url'
    | 'invalid_model'
    | 'invalid_credential'
    | 'blocked_capability_override'
    | 'url_scheme_not_allowed'
    | 'url_has_userinfo'
    | 'url_has_query'
    | 'url_has_fragment'
  message: string
}>

// ---------------------------------------------------------------------------
// URL builder
// ---------------------------------------------------------------------------

const CHAT_COMPLETIONS_PATH = '/chat/completions'

/**
 * Normalize a base URL and append /chat/completions if needed.
 *
 * Rules:
 * - trim whitespace
 * - allow only http: and https:
 * - reject embedded username/password
 * - reject query string or fragment
 * - remove trailing slashes
 * - if already ends with /chat/completions, leave unchanged
 */
export function buildChatCompletionsUrl(rawBaseUrl: string): string | DescriptorValidationError {
  if (typeof rawBaseUrl !== 'string') {
    return { code: 'invalid_base_url', message: 'Base URL must be a string' }
  }

  const trimmed = rawBaseUrl.trim()
  if (trimmed.length === 0) {
    return { code: 'invalid_base_url', message: 'Base URL must not be empty' }
  }

  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    return { code: 'invalid_base_url', message: 'Base URL is not a valid URL' }
  }

  // Protocol check
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { code: 'url_scheme_not_allowed', message: `URL protocol "${url.protocol}" is not allowed. Only http: and https: are supported.` }
  }

  // Reject userinfo (username/password in URL)
  if (url.username || url.password) {
    return { code: 'url_has_userinfo', message: 'URL must not contain embedded username or password' }
  }

  // Reject query string
  if (url.search) {
    return { code: 'url_has_query', message: 'URL must not contain a query string' }
  }

  // Reject fragment
  if (url.hash) {
    return { code: 'url_has_fragment', message: 'URL must not contain a fragment' }
  }

  // Build clean base: protocol + host (includes port) + pathname
  let base = `${url.protocol}//${url.host}${url.pathname}`

  // Remove trailing slashes
  base = base.replace(/\/+$/, '')

  // If already ends with /chat/completions, leave unchanged
  if (base.endsWith(CHAT_COMPLETIONS_PATH)) {
    return base
  }

  return base + CHAT_COMPLETIONS_PATH
}

// ---------------------------------------------------------------------------
// Descriptor validation
// ---------------------------------------------------------------------------

/**
 * Validate and build a GenericEndpointDescriptor from raw inputs.
 *
 * Returns the descriptor or a validation error. Never exposes raw tokens
 * in error messages.
 */
export function validateGenericEndpointDescriptor(input: {
  profileId: string
  baseUrl: string
  model: string
  apiKey: string
}): GenericEndpointDescriptor | DescriptorValidationError {
  // Profile
  if (input.profileId !== GENERIC_OPENAI_COMPAT_CHAT_COMPLETIONS_PROFILE_ID) {
    return { code: 'invalid_profile', message: `Unknown profile "${input.profileId}". Only "${GENERIC_OPENAI_COMPAT_CHAT_COMPLETIONS_PROFILE_ID}" is supported.` }
  }

  // URL
  const urlOrError = buildChatCompletionsUrl(input.baseUrl)
  if (typeof urlOrError !== 'string') {
    return urlOrError
  }

  // Model
  if (typeof input.model !== 'string' || input.model.trim().length === 0) {
    return { code: 'invalid_model', message: 'Model must be a non-empty string' }
  }
  const model = input.model.trim()

  // Credential
  const cred = createBearerCredential(input.apiKey)
  if (isCredentialError(cred)) {
    return { code: 'invalid_credential', message: cred.message }
  }

  return {
    profileId: GENERIC_OPENAI_COMPAT_CHAT_COMPLETIONS_PROFILE_ID,
    baseUrl: urlOrError,
    model,
    credential: cred,
    capability: { ...DEFAULT_CAPABILITY },
  }
}

/**
 * Check if a capability override attempt is valid for Generic.
 * Returns an error if any blocked feature is being enabled.
 */
export function validateCapabilityOverride(
  overrides: Record<string, unknown>,
): DescriptorValidationError | null {
  for (const key of BLOCKED_FEATURES) {
    if (key in overrides && overrides[key] === true) {
      return {
        code: 'blocked_capability_override',
        message: `Cannot enable "${key}" in Generic conservative fixture. This feature is not supported.`,
      }
    }
  }
  return null
}

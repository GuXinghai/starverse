/**
 * Provider credential boundary — adapter-side fixture seed.
 *
 * Defines minimal credential material for provider adapters.
 * Pure functions only. No storage, no IPC, no renderer, no registry.
 *
 * Key invariant: raw token must never appear in diagnostics, masked
 * metadata, emitted events, or test snapshots.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Bearer credential material for adapter use. */
export type BearerCredential = Readonly<{
  kind: 'bearer'
  token: string
}>

/** Adapter-side credential material — currently bearer only. */
export type ProviderCredential = BearerCredential

/** Renderer-safe / diagnostic-safe masked metadata. */
export type MaskedCredentialInfo = Readonly<{
  kind: 'bearer'
  present: boolean
  maskedToken: string
}>

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export type CredentialError = Readonly<{
  code: 'missing_token' | 'empty_token'
  message: string
}>

// ---------------------------------------------------------------------------
// Construction
// ---------------------------------------------------------------------------

/**
 * Create a bearer credential. Rejects missing or whitespace-only tokens.
 */
export function createBearerCredential(token: string): ProviderCredential | CredentialError {
  if (token === undefined || token === null) {
    return { code: 'missing_token', message: 'Bearer token is required' }
  }
  if (typeof token !== 'string' || token.trim().length === 0) {
    return { code: 'empty_token', message: 'Bearer token must not be empty or whitespace' }
  }
  return { kind: 'bearer', token }
}

// ---------------------------------------------------------------------------
// Auth header construction
// ---------------------------------------------------------------------------

/**
 * Build Authorization header from credential material.
 * Returns error credential result if invalid.
 */
export function buildAuthHeader(cred: ProviderCredential | CredentialError): { Authorization: string } | CredentialError {
  if ('code' in cred) return cred
  return { Authorization: `Bearer ${cred.token}` }
}

/**
 * Build full provider auth headers from credential material.
 * Returns error credential result if invalid.
 */
export function buildProviderAuthHeaders(cred: ProviderCredential | CredentialError): Record<string, string> | CredentialError {
  const header = buildAuthHeader(cred)
  if ('code' in header) return header
  return { ...header }
}

// ---------------------------------------------------------------------------
// Masking / redaction
// ---------------------------------------------------------------------------

const MASK_MARKER = '***'

/**
 * Produce masked credential info for diagnostics / renderer.
 * Raw token NEVER appears in output.
 */
export function maskCredential(cred: ProviderCredential | CredentialError): MaskedCredentialInfo {
  if ('code' in cred) {
    return { kind: 'bearer', present: false, maskedToken: MASK_MARKER }
  }
  return {
    kind: cred.kind,
    present: true,
    maskedToken: MASK_MARKER,
  }
}

/**
 * Check if a credential is valid (not an error).
 */
export function isCredentialValid(cred: ProviderCredential | CredentialError): cred is ProviderCredential {
  return !('code' in cred)
}

/**
 * Check if a value is a CredentialError.
 */
export function isCredentialError(value: unknown): value is CredentialError {
  return (
    typeof value === 'object' &&
    value !== null &&
    'code' in value &&
    typeof (value as any).code === 'string' &&
    ((value as any).code === 'missing_token' || (value as any).code === 'empty_token')
  )
}

// ---------------------------------------------------------------------------
// Credential-aware message redaction
// ---------------------------------------------------------------------------

const REDACTED = '[REDACTED_CREDENTIAL]'

/**
 * Redact credential material from an external error message.
 *
 * Strips:
 * - the exact bearer token
 * - `Bearer <token>` patterns
 * - `Authorization: Bearer <token>` patterns
 *
 * Safe to call with any message. If token is empty, only pattern-based
 * redaction is applied.
 */
export function redactCredentialFromMessage(message: string, token: string): string {
  if (!message) return message

  let result = message

  // Strip Authorization: Bearer <token-like> patterns first (case-insensitive)
  result = result.replace(/Authorization:\s*Bearer\s+[A-Za-z0-9\-._~+/]+=*/gi, REDACTED)

  // Strip standalone Bearer <token-like> patterns
  result = result.replace(/Bearer\s+[A-Za-z0-9\-._~+/]+=*/g, REDACTED)

  // Strip exact token occurrence (catches any remaining token references)
  if (token && token.length > 0) {
    // Escape token for use in regex, then replace globally
    const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    result = result.replace(new RegExp(escaped, 'g'), REDACTED)
  }

  return result
}

/**
 * Sanitize a provider-controlled error code for safe use in
 * renderer-visible `StarverseProviderError.code`.
 *
 * - Applies credential redaction.
 * - If the result is empty, contains `[REDACTED_CREDENTIAL]`,
 *   or is otherwise unsafe, returns the provided fallback.
 * - If the result is a short safe string, returns it after redaction.
 */
export function sanitizeErrorCode(
  rawCode: unknown,
  token: string,
  fallback: string,
): string {
  if (typeof rawCode !== 'string' || rawCode.length === 0) return fallback

  const sanitized = redactCredentialFromMessage(rawCode, token)

  // If redaction changed the value, the code contained credential material
  if (sanitized !== rawCode) return fallback

  // If result contains the redaction marker, it's unsafe
  if (sanitized.includes(REDACTED)) return fallback

  // Cap length to avoid absurd values
  if (sanitized.length > 128) return fallback

  return sanitized
}

/**
 * Provider credential resolver boundary — fixture seed.
 *
 * Defines non-secret credential references and injected resolver result
 * semantics. This layer does not read store/env/IPC and is not a registry,
 * manager, service, or secure store.
 */

import {
  type CredentialError,
  type ProviderCredential,
  isSecretLikeCredentialFieldName,
  isCredentialError,
} from '@/next/provider/credentials/providerCredential'

// ---------------------------------------------------------------------------
// Non-secret credential reference
// ---------------------------------------------------------------------------

export type ProviderCredentialRef = Readonly<{
  kind: 'credential_ref'
  id: string
}>

// ---------------------------------------------------------------------------
// Resolver result
// ---------------------------------------------------------------------------

export type ProviderCredentialResolutionError = Readonly<{
  code: 'invalid_credential_ref' | 'credential_unresolved' | 'credential_invalid'
  message: string
}>

export type ProviderCredentialResolution =
  | Readonly<{ ok: true; credential: ProviderCredential }>
  | Readonly<{ ok: false; error: ProviderCredentialResolutionError }>

export type ProviderCredentialResolver = (
  ref: ProviderCredentialRef,
) => ProviderCredentialResolution

function credentialRefError(message: string): ProviderCredentialResolutionError {
  return { code: 'invalid_credential_ref', message }
}

/**
 * Validate a renderer-safe credential reference.
 *
 * The reference is only a pointer. It must not contain raw token material,
 * auth headers, custom headers, passwords, or other secret-like fields.
 */
export function validateProviderCredentialRef(
  value: unknown,
): ProviderCredentialRef | ProviderCredentialResolutionError {
  if (!value || typeof value !== 'object') {
    return credentialRefError('Credential reference is required and must be a credential_ref.')
  }

  const input = value as Record<string, unknown>
  for (const key of Object.keys(input)) {
    if (isSecretLikeCredentialFieldName(key)) {
      return credentialRefError('Credential reference must not contain secret-like fields.')
    }
  }

  if (input.kind !== 'credential_ref') {
    return credentialRefError('Credential reference is required and must be a credential_ref.')
  }
  if (typeof input.id !== 'string' || input.id.trim().length === 0) {
    return credentialRefError('Credential reference id must be a non-empty string.')
  }

  return { kind: 'credential_ref', id: input.id.trim() }
}

export function providerCredentialResolutionSuccess(
  credential: ProviderCredential,
): ProviderCredentialResolution {
  return { ok: true, credential }
}

export function providerCredentialResolutionFromCredential(
  credential: ProviderCredential | CredentialError,
): ProviderCredentialResolution {
  if (isCredentialError(credential)) {
    return providerCredentialResolutionFailure('credential_invalid')
  }
  return providerCredentialResolutionSuccess(credential)
}

export function providerCredentialResolutionFailure(
  code: ProviderCredentialResolutionError['code'] = 'credential_unresolved',
): ProviderCredentialResolution {
  return {
    ok: false,
    error: {
      code,
      message: code === 'credential_invalid'
        ? 'Credential material is invalid.'
        : code === 'invalid_credential_ref'
          ? 'Credential reference is invalid.'
          : 'Credential could not be resolved.',
    },
  }
}

/**
 * Resolve a non-secret ref into adapter-side credential material.
 *
 * Resolver failures are normalized to static safe messages so raw resolver
 * output cannot leak into events, diagnostics, or snapshots.
 */
export function resolveProviderCredential(
  ref: unknown,
  resolver: ProviderCredentialResolver,
): ProviderCredentialResolution {
  const validatedRef = validateProviderCredentialRef(ref)
  if ('code' in validatedRef) {
    return { ok: false, error: validatedRef }
  }

  try {
    const result = resolver(validatedRef)
    if (result.ok === true) {
      return providerCredentialResolutionFromCredential(result.credential as ProviderCredential | CredentialError)
    }
    if (result.error.code === 'credential_invalid') {
      return providerCredentialResolutionFailure('credential_invalid')
    }
    if (result.error.code === 'invalid_credential_ref') {
      return providerCredentialResolutionFailure('invalid_credential_ref')
    }
    return providerCredentialResolutionFailure('credential_unresolved')
  } catch {
    return providerCredentialResolutionFailure('credential_unresolved')
  }
}

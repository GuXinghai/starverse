/**
 * Provider credential safe metadata boundary.
 *
 * Pure helpers for renderer-safe credential status and diagnostics. These
 * functions never resolve credentials and never include raw credential
 * material, raw store messages, Authorization values, headers, or URL userinfo.
 */

import {
  isCredentialError,
  type CredentialError,
  type ProviderCredential,
} from '@/next/provider/credentials/providerCredential'
import type {
  ProviderCredentialRef,
  ProviderCredentialResolution,
} from '@/next/provider/credentials/providerCredentialResolver'
import type {
  ProviderCredentialStoreResult,
} from '@/next/provider/credentials/providerCredentialStore'

export type ProviderCredentialDiagnosticCode =
  | 'credential_configured'
  | 'credential_missing'
  | 'credential_invalid'
  | 'credential_unavailable'
  | 'credential_error'
  | 'credential_redacted'
  | 'credential_secret_rejected'

export type ProviderCredentialMetadataStatus =
  | 'configured'
  | 'missing'
  | 'invalid'
  | 'unavailable'
  | 'error'

export type SafeProviderCredentialMetadata = Readonly<{
  credentialRefId: string
  present: boolean
  status: ProviderCredentialMetadataStatus
  code: ProviderCredentialDiagnosticCode
  safeMessage: string
  kind?: ProviderCredential['kind']
}>

const MASKED_CREDENTIAL_REF_ID = '***'
const MISSING_CREDENTIAL_REF_ID = '[missing-credential-ref]'

const SAFE_CREDENTIAL_MESSAGES: Record<ProviderCredentialDiagnosticCode, string> = {
  credential_configured: 'Credential is configured.',
  credential_missing: 'Credential is missing.',
  credential_invalid: 'Credential material is invalid.',
  credential_unavailable: 'Credential store is unavailable.',
  credential_error: 'Credential status is unavailable.',
  credential_redacted: 'Credential details are redacted.',
  credential_secret_rejected: 'Credential input contains secret-like fields.',
}

export function safeCredentialDiagnosticMessage(
  code: ProviderCredentialDiagnosticCode,
): string {
  return SAFE_CREDENTIAL_MESSAGES[code]
}

export function maskProviderCredentialRefId(
  ref: ProviderCredentialRef | null | undefined,
): string {
  if (!ref || typeof ref.id !== 'string' || ref.id.trim().length === 0) {
    return MISSING_CREDENTIAL_REF_ID
  }
  return MASKED_CREDENTIAL_REF_ID
}

function safeCredentialMetadata(
  ref: ProviderCredentialRef | null | undefined,
  status: ProviderCredentialMetadataStatus,
  code: ProviderCredentialDiagnosticCode,
  options?: Readonly<{
    present?: boolean
    kind?: ProviderCredential['kind']
  }>,
): SafeProviderCredentialMetadata {
  return {
    credentialRefId: maskProviderCredentialRefId(ref),
    present: options?.present ?? status === 'configured',
    status,
    code,
    safeMessage: safeCredentialDiagnosticMessage(code),
    ...(options?.kind ? { kind: options.kind } : {}),
  }
}

export function safeProviderCredentialMetadataFromRef(
  ref: ProviderCredentialRef | null | undefined,
): SafeProviderCredentialMetadata {
  if (!ref) {
    return safeCredentialMetadata(null, 'missing', 'credential_missing', { present: false })
  }
  return safeCredentialMetadata(ref, 'configured', 'credential_configured', { present: true })
}

export function safeProviderCredentialMetadataFromCredential(
  ref: ProviderCredentialRef | null | undefined,
  credential: ProviderCredential | CredentialError,
): SafeProviderCredentialMetadata {
  if (isCredentialError(credential)) {
    return safeCredentialMetadata(ref, 'invalid', 'credential_invalid', { present: false })
  }
  return safeCredentialMetadata(ref, 'configured', 'credential_configured', {
    present: true,
    kind: credential.kind,
  })
}

export function safeProviderCredentialMetadataFromResolution(
  ref: ProviderCredentialRef | null | undefined,
  resolution: ProviderCredentialResolution,
): SafeProviderCredentialMetadata {
  if (resolution.ok) {
    return safeCredentialMetadata(ref, 'configured', 'credential_configured', {
      present: true,
      kind: resolution.credential.kind,
    })
  }

  if (resolution.error.code === 'credential_invalid') {
    return safeCredentialMetadata(ref, 'invalid', 'credential_invalid', { present: false })
  }

  if (resolution.error.code === 'invalid_credential_ref') {
    return safeCredentialMetadata(ref, 'error', 'credential_error', { present: false })
  }

  return safeCredentialMetadata(ref, 'missing', 'credential_missing', { present: false })
}

export function safeProviderCredentialMetadataFromStoreResult(
  ref: ProviderCredentialRef | null | undefined,
  result: ProviderCredentialStoreResult,
): SafeProviderCredentialMetadata {
  if (result.ok) {
    return safeCredentialMetadata(ref, 'configured', 'credential_configured', {
      present: true,
      kind: result.credential.kind,
    })
  }

  if (result.code === 'credential_missing') {
    return safeCredentialMetadata(ref, 'missing', 'credential_missing', { present: false })
  }
  if (result.code === 'credential_invalid') {
    return safeCredentialMetadata(ref, 'invalid', 'credential_invalid', { present: false })
  }
  if (result.code === 'store_unavailable') {
    return safeCredentialMetadata(ref, 'unavailable', 'credential_unavailable', { present: false })
  }
  return safeCredentialMetadata(ref, 'error', 'credential_error', { present: false })
}

export function safeProviderCredentialMetadataForStoreError(
  ref: ProviderCredentialRef | null | undefined,
): SafeProviderCredentialMetadata {
  return safeCredentialMetadata(ref, 'error', 'credential_error', { present: false })
}

export function safeProviderCredentialMetadataForSecretRejected(
  ref: ProviderCredentialRef | null | undefined,
): SafeProviderCredentialMetadata {
  return safeCredentialMetadata(ref, 'error', 'credential_secret_rejected', { present: false })
}

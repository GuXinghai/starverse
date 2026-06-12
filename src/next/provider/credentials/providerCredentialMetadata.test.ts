import { describe, expect, it } from 'vitest'
import {
  createBearerCredential,
  isCredentialValid,
} from '@/next/provider/credentials/providerCredential'
import {
  providerCredentialResolutionFailure,
  type ProviderCredentialRef,
  type ProviderCredentialResolution,
} from '@/next/provider/credentials/providerCredentialResolver'
import {
  providerCredentialStoreCredential,
  providerCredentialStoreError,
  providerCredentialStoreInvalid,
  providerCredentialStoreMissing,
  providerCredentialStoreUnavailable,
  type ProviderCredentialStoreResult,
} from '@/next/provider/credentials/providerCredentialStore'
import {
  safeCredentialDiagnosticMessage,
  safeProviderCredentialMetadataForSecretRejected,
  safeProviderCredentialMetadataForStoreError,
  safeProviderCredentialMetadataFromCredential,
  safeProviderCredentialMetadataFromRef,
  safeProviderCredentialMetadataFromResolution,
  safeProviderCredentialMetadataFromStoreResult,
} from '@/next/provider/credentials/providerCredentialMetadata'

const REF: ProviderCredentialRef = { kind: 'credential_ref', id: 'generic-default' }
const RAW_TOKEN = 'sk-metadata-secret-token'
const UNSAFE_STORE_MESSAGE =
  `Authorization: Bearer ${RAW_TOKEN} headers={"Authorization":"Bearer ${RAW_TOKEN}"} userinfo`

function expectNoSecretLeak(value: unknown): void {
  const serialized = JSON.stringify(value)
  expect(serialized).not.toContain(RAW_TOKEN)
  expect(serialized).not.toContain('Bearer')
  expect(serialized).not.toContain('Authorization')
  expect(serialized).not.toContain('headers')
  expect(serialized).not.toContain('userinfo')
}

describe('provider credential safe metadata boundary', () => {
  it('configured credential metadata contains no raw secret material', () => {
    const credential = createBearerCredential(RAW_TOKEN)
    expect(isCredentialValid(credential)).toBe(true)
    if (!isCredentialValid(credential)) {
      throw new Error('Expected valid credential in test setup')
    }

    const metadata = safeProviderCredentialMetadataFromCredential(REF, credential)

    expect(metadata).toMatchObject({
      credentialRefId: '***',
      present: true,
      status: 'configured',
      code: 'credential_configured',
      safeMessage: 'Credential is configured.',
      kind: 'bearer',
    })
    expectNoSecretLeak(metadata)
  })

  it('missing credential metadata uses safe status and code', () => {
    const metadata = safeProviderCredentialMetadataFromRef(null)

    expect(metadata).toEqual({
      credentialRefId: '[missing-credential-ref]',
      present: false,
      status: 'missing',
      code: 'credential_missing',
      safeMessage: 'Credential is missing.',
    })
  })

  it('invalid credential metadata uses safe status and code', () => {
    const credential = createBearerCredential('')

    const metadata = safeProviderCredentialMetadataFromCredential(REF, credential)

    expect(metadata).toMatchObject({
      present: false,
      status: 'invalid',
      code: 'credential_invalid',
      safeMessage: 'Credential material is invalid.',
    })
    expectNoSecretLeak(metadata)
  })

  it('store missing, invalid, unavailable, and internal results map to stable safe diagnostics', () => {
    const cases: ReadonlyArray<Readonly<{
      result: ProviderCredentialStoreResult
      status: string
      code: string
    }>> = [
      { result: providerCredentialStoreMissing(), status: 'missing', code: 'credential_missing' },
      { result: providerCredentialStoreInvalid(), status: 'invalid', code: 'credential_invalid' },
      { result: providerCredentialStoreUnavailable(), status: 'unavailable', code: 'credential_unavailable' },
      { result: providerCredentialStoreError(), status: 'error', code: 'credential_error' },
      {
        result: { ok: false, code: 'store_error', message: UNSAFE_STORE_MESSAGE },
        status: 'error',
        code: 'credential_error',
      },
    ]

    for (const { result, status, code } of cases) {
      const metadata = safeProviderCredentialMetadataFromStoreResult(REF, result)
      expect(metadata.status).toBe(status)
      expect(metadata.code).toBe(code)
      expect(metadata.present).toBe(false)
      expectNoSecretLeak(metadata)
    }
  })

  it('store success result maps to configured metadata without exposing token', () => {
    const credential = createBearerCredential(RAW_TOKEN)
    expect(isCredentialValid(credential)).toBe(true)
    if (!isCredentialValid(credential)) {
      throw new Error('Expected valid credential in test setup')
    }

    const metadata = safeProviderCredentialMetadataFromStoreResult(
      REF,
      providerCredentialStoreCredential(credential),
    )

    expect(metadata.status).toBe('configured')
    expect(metadata.code).toBe('credential_configured')
    expect(metadata.kind).toBe('bearer')
    expectNoSecretLeak(metadata)
  })

  it('resolver failure messages are not included in safe metadata', () => {
    const resolution: ProviderCredentialResolution = {
      ok: false,
      error: {
        code: 'credential_unresolved',
        message: UNSAFE_STORE_MESSAGE,
      },
    }

    const metadata = safeProviderCredentialMetadataFromResolution(REF, resolution)

    expect(metadata.status).toBe('missing')
    expect(metadata.code).toBe('credential_missing')
    expect(metadata.safeMessage).toBe('Credential is missing.')
    expectNoSecretLeak(metadata)
  })

  it('resolver invalid and invalid-ref results map to safe diagnostics', () => {
    const invalid = safeProviderCredentialMetadataFromResolution(
      REF,
      providerCredentialResolutionFailure('credential_invalid'),
    )
    const invalidRef = safeProviderCredentialMetadataFromResolution(
      REF,
      providerCredentialResolutionFailure('invalid_credential_ref'),
    )

    expect(invalid.status).toBe('invalid')
    expect(invalid.code).toBe('credential_invalid')
    expect(invalidRef.status).toBe('error')
    expect(invalidRef.code).toBe('credential_error')
    expectNoSecretLeak(invalid)
    expectNoSecretLeak(invalidRef)
  })

  it('store thrown-error and secret-rejected metadata use safe static messages', () => {
    const storeError = safeProviderCredentialMetadataForStoreError(REF)
    const secretRejected = safeProviderCredentialMetadataForSecretRejected(REF)

    expect(storeError).toMatchObject({
      status: 'error',
      code: 'credential_error',
      safeMessage: 'Credential status is unavailable.',
    })
    expect(secretRejected).toMatchObject({
      status: 'error',
      code: 'credential_secret_rejected',
      safeMessage: 'Credential input contains secret-like fields.',
    })
    expectNoSecretLeak(storeError)
    expectNoSecretLeak(secretRejected)
  })

  it('diagnostic code vocabulary is stable and renderer-safe', () => {
    expect(safeCredentialDiagnosticMessage('credential_configured')).toBe('Credential is configured.')
    expect(safeCredentialDiagnosticMessage('credential_missing')).toBe('Credential is missing.')
    expect(safeCredentialDiagnosticMessage('credential_invalid')).toBe('Credential material is invalid.')
    expect(safeCredentialDiagnosticMessage('credential_unavailable')).toBe('Credential store is unavailable.')
    expect(safeCredentialDiagnosticMessage('credential_error')).toBe('Credential status is unavailable.')
    expect(safeCredentialDiagnosticMessage('credential_redacted')).toBe('Credential details are redacted.')
    expect(safeCredentialDiagnosticMessage('credential_secret_rejected')).toBe('Credential input contains secret-like fields.')
  })
})

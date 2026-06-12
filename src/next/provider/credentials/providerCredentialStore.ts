/**
 * Provider credential store boundary — pure adapter/main seed.
 *
 * Defines the narrow store contract needed to resolve non-secret
 * ProviderCredentialRef values into adapter-side credential material.
 * No singleton, no electron-store, no env, no IPC, no renderer exposure,
 * no secure-store implementation, and no provider/endpoint registry.
 */

import type { ProviderCredential } from '@/next/provider/credentials/providerCredential'
import {
  providerCredentialResolutionFailure,
  providerCredentialResolutionSuccess,
  type ProviderCredentialRef,
  type ProviderCredentialResolution,
  type ProviderCredentialResolver,
} from '@/next/provider/credentials/providerCredentialResolver'

export type ProviderCredentialStoreFailureCode =
  | 'credential_missing'
  | 'credential_invalid'
  | 'store_unavailable'
  | 'store_error'

export type ProviderCredentialStoreResult =
  | Readonly<{ ok: true; credential: ProviderCredential }>
  | Readonly<{
    ok: false
    code: ProviderCredentialStoreFailureCode
    message?: string
  }>

export type ProviderCredentialStore = Readonly<{
  getCredential(ref: ProviderCredentialRef): ProviderCredentialStoreResult
}>

export function providerCredentialStoreCredential(
  credential: ProviderCredential,
): ProviderCredentialStoreResult {
  return { ok: true, credential }
}

export function providerCredentialStoreMissing(): ProviderCredentialStoreResult {
  return { ok: false, code: 'credential_missing' }
}

export function providerCredentialStoreInvalid(): ProviderCredentialStoreResult {
  return { ok: false, code: 'credential_invalid' }
}

export function providerCredentialStoreUnavailable(): ProviderCredentialStoreResult {
  return { ok: false, code: 'store_unavailable' }
}

export function providerCredentialStoreError(): ProviderCredentialStoreResult {
  return { ok: false, code: 'store_error' }
}

/**
 * Adapt a store boundary into the existing injected ProviderCredentialResolver.
 *
 * Store messages are intentionally ignored and normalized to static resolver
 * failures so raw token material, Authorization headers, and implementation
 * details cannot leak into Generic config errors or stream events.
 */
export function providerCredentialResolverFromStore(
  store: ProviderCredentialStore,
): ProviderCredentialResolver {
  return (ref): ProviderCredentialResolution => {
    try {
      const result = store.getCredential(ref)
      if (result.ok) {
        return providerCredentialResolutionSuccess(result.credential)
      }
      if (result.code === 'credential_invalid') {
        return providerCredentialResolutionFailure('credential_invalid')
      }
      return providerCredentialResolutionFailure('credential_unresolved')
    } catch {
      return providerCredentialResolutionFailure('credential_unresolved')
    }
  }
}

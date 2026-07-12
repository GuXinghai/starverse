import { z } from 'zod'
import type Store from 'electron-store'
import {
  COMPATIBLE_JSON_SCHEMA_VERSION,
  compatibleRegistryCredentialInputSchema,
  credentialVersionRefSchema,
  normalizeCompatibleHeaderName,
  type CompatibleCredentialMaskedSummary,
  type CompatibleRegistryCredentialInput,
  type CredentialVersionRef,
} from '../../src/shared/provider/openai-chat-compatible'
import type { ProviderSecureStorageBackend } from './providerCredentialService'

export const COMPATIBLE_CREDENTIAL_SECURE_STORE_ROOT = 'compatibleCredentials'
export const COMPATIBLE_CREDENTIAL_SECURE_STORE_NAMESPACE = `${COMPATIBLE_CREDENTIAL_SECURE_STORE_ROOT}.v1`
export const COMPATIBLE_CREDENTIAL_SECURE_STORE_KEY_PREFIX = `${COMPATIBLE_CREDENTIAL_SECURE_STORE_NAMESPACE}.`

const secureRecordSchema = z.object({
  version: z.literal(1),
  credentialVersionRef: credentialVersionRefSchema,
  backend: z.literal('electron_safe_storage'),
  ciphertextBase64: z.string().min(1).max(256 * 1024),
  createdAtMs: z.number().int().nonnegative(),
}).strict()

export type CompatibleCredentialService = Readonly<{
  write: (credentialVersionRef: CredentialVersionRef, payload: CompatibleRegistryCredentialInput) => CompatibleCredentialMaskedSummary
  readForMain: (credentialVersionRef: CredentialVersionRef) => CompatibleRegistryCredentialInput
  delete: (credentialVersionRef: CredentialVersionRef) => void
  has: (credentialVersionRef: CredentialVersionRef) => boolean
  listRefsForMain: () => readonly CredentialVersionRef[]
}>

export function compatibleCredentialSecureStoreKey(credentialVersionRef: CredentialVersionRef): string {
  return `${COMPATIBLE_CREDENTIAL_SECURE_STORE_KEY_PREFIX}${credentialVersionRef}`
}

export function isCompatibleCredentialSecureStoreKey(key: string): boolean {
  return String(key ?? '').startsWith(COMPATIBLE_CREDENTIAL_SECURE_STORE_KEY_PREFIX)
}

function requireSecureBackend(secureStorage: ProviderSecureStorageBackend): void {
  let available = false
  try {
    available = secureStorage.isEncryptionAvailable()
  } catch {
    available = false
  }
  if (!available) throw new Error('Compatible credential secure store is unavailable.')
}

function buildMaskedSummary(payload: CompatibleRegistryCredentialInput): CompatibleCredentialMaskedSummary {
  const sensitiveHeaderNames = payload.mode === 'custom_headers'
    ? payload.headers.map((entry: { name: string }) => normalizeCompatibleHeaderName(entry.name)).sort()
    : []
  return {
    schemaVersion: COMPATIBLE_JSON_SCHEMA_VERSION,
    authMode: payload.mode,
    configured: payload.mode !== 'none',
    maskState: payload.mode === 'none' ? 'not_applicable' : 'configured_masked',
    sensitiveHeaderNames,
  }
}

export function createCompatibleCredentialService(
  store: Store,
  input: Readonly<{ secureStorage: ProviderSecureStorageBackend; nowMs?: () => number }>,
): CompatibleCredentialService {
  const nowMs = input.nowMs ?? Date.now

  function write(credentialVersionRef: CredentialVersionRef, rawPayload: CompatibleRegistryCredentialInput) {
    const ref = credentialVersionRefSchema.parse(credentialVersionRef)
    const payload = compatibleRegistryCredentialInputSchema.parse(rawPayload)
    if (payload.mode === 'none') throw new Error('No-auth mode does not create a secure credential payload.')
    requireSecureBackend(input.secureStorage)
    const key = compatibleCredentialSecureStoreKey(ref)
    if (store.get(key) !== undefined) throw new Error('Compatible credential version already exists.')
    const plaintext = JSON.stringify(payload)
    const encrypted = input.secureStorage.encryptString(plaintext)
    const ciphertextBase64 = Buffer.isBuffer(encrypted)
      ? encrypted.toString('base64')
      : Buffer.from(encrypted, 'utf8').toString('base64')
    store.set(key, {
      version: 1,
      credentialVersionRef: ref,
      backend: 'electron_safe_storage',
      ciphertextBase64,
      createdAtMs: nowMs(),
    })
    return buildMaskedSummary(payload)
  }

  function readForMain(credentialVersionRef: CredentialVersionRef): CompatibleRegistryCredentialInput {
    const ref = credentialVersionRefSchema.parse(credentialVersionRef)
    requireSecureBackend(input.secureStorage)
    const record = secureRecordSchema.safeParse(store.get(compatibleCredentialSecureStoreKey(ref)))
    if (!record.success || record.data.credentialVersionRef !== ref) {
      throw new Error('Compatible credential is unavailable.')
    }
    try {
      const decrypted = input.secureStorage.decryptString(Buffer.from(record.data.ciphertextBase64, 'base64'))
      const payload = compatibleRegistryCredentialInputSchema.parse(JSON.parse(decrypted))
      if (payload.mode === 'none') throw new Error('invalid no-auth payload')
      return payload
    } catch {
      throw new Error('Compatible credential could not be decrypted safely.')
    }
  }

  function deleteCredential(credentialVersionRef: CredentialVersionRef): void {
    const ref = credentialVersionRefSchema.parse(credentialVersionRef)
    const key = compatibleCredentialSecureStoreKey(ref)
    store.delete(key)
    if (store.get(key) !== undefined) throw new Error('Compatible credential could not be deleted safely.')
  }

  function has(credentialVersionRef: CredentialVersionRef): boolean {
    const ref = credentialVersionRefSchema.parse(credentialVersionRef)
    const record = secureRecordSchema.safeParse(store.get(compatibleCredentialSecureStoreKey(ref)))
    return record.success && record.data.credentialVersionRef === ref
  }

  function listRefsForMain(): readonly CredentialVersionRef[] {
    const root = (store as unknown as { store?: unknown }).store
    if (!root || typeof root !== 'object') return []
    const values = root as Record<string, unknown>
    const nested = values[COMPATIBLE_CREDENTIAL_SECURE_STORE_ROOT]
    const versioned = nested && typeof nested === 'object'
      ? (nested as Record<string, unknown>).v1
      : undefined
    const candidates = new Set<string>()
    if (versioned && typeof versioned === 'object') {
      for (const key of Object.keys(versioned as Record<string, unknown>)) candidates.add(key)
    }
    for (const key of Object.keys(values)) {
      if (key.startsWith(COMPATIBLE_CREDENTIAL_SECURE_STORE_KEY_PREFIX)) {
        candidates.add(key.slice(COMPATIBLE_CREDENTIAL_SECURE_STORE_KEY_PREFIX.length))
      }
    }
    return Object.freeze([...candidates]
      .map((candidate) => credentialVersionRefSchema.safeParse(candidate))
      .filter((result): result is { success: true; data: CredentialVersionRef } => result.success)
      .map((result) => result.data)
      .sort())
  }

  return { write, readForMain, delete: deleteCredential, has, listRefsForMain }
}

import type Store from 'electron-store'
import {
  OPENROUTER_CHAT_LEGACY_API_KEY_STORE_KEY,
} from '../../src/next/provider/openrouter/openRouterLegacyCredential'

export type ProviderCredentialKey =
  | 'openrouter'
  | 'openai_responses'
  | 'google_ai_studio'
  | 'anthropic'
  | 'deepseek'

export type ProviderCredentialStatusSource =
  | 'secure_store'
  | 'plaintext_fallback'
  | 'missing'

export type ProviderCredentialBackendKind = 'electron_safe_storage' | 'plaintext_fallback' | 'unavailable'

export const PROVIDER_CREDENTIAL_SECURE_STORE_KEY_PREFIX = 'providerCredentials.v1.'

export const PROVIDER_CREDENTIAL_LEGACY_STORE_KEYS = {
  openrouter: OPENROUTER_CHAT_LEGACY_API_KEY_STORE_KEY,
  openai_responses: 'openAIResponsesApiKey',
  google_ai_studio: 'googleAIStudioApiKey',
  anthropic: 'anthropicApiKey',
  deepseek: 'deepSeekApiKey',
} as const satisfies Record<ProviderCredentialKey, string>

export const PROVIDER_CREDENTIAL_KEYS = Object.keys(PROVIDER_CREDENTIAL_LEGACY_STORE_KEYS) as ProviderCredentialKey[]

export type ProviderCredentialReadResult =
  | Readonly<{
    ok: true
    providerKey: ProviderCredentialKey
    apiKey: string
    source: Exclude<ProviderCredentialStatusSource, 'missing'>
    backend: Exclude<ProviderCredentialBackendKind, 'unavailable'>
    migratedFromLegacy: boolean
    warnings: string[]
  }>
  | Readonly<{
    ok: false
    providerKey: ProviderCredentialKey
    code: 'credential_missing' | 'store_unavailable'
    message: string
    source: 'missing'
    backend: ProviderCredentialBackendKind
    warnings: string[]
  }>

export type ProviderCredentialStatus = Readonly<{
  providerKey: ProviderCredentialKey
  source: ProviderCredentialStatusSource
  backend: ProviderCredentialBackendKind
  apiKeyConfigured: boolean
  maskedApiKey?: '***'
  migratedFromLegacy?: boolean
  warnings: string[]
}>

export type ProviderSecureStorageBackend = Readonly<{
  kind: 'electron_safe_storage'
  isEncryptionAvailable: () => boolean
  encryptString: (value: string) => Buffer | string
  decryptString: (encrypted: Buffer) => string
}>

export type ProviderCredentialServiceOptions = Readonly<{
  secureStorage: ProviderSecureStorageBackend
  allowPlaintextFallback?: boolean
  nowMs?: () => number
}>

export type ProviderCredentialService = Readonly<{
  readApiKey: (providerKey: ProviderCredentialKey) => ProviderCredentialReadResult
  getStatus: (providerKey: ProviderCredentialKey) => ProviderCredentialStatus
  updateApiKey: (providerKey: ProviderCredentialKey, apiKey: string) => ProviderCredentialStatus
  clearApiKey: (providerKey: ProviderCredentialKey) => ProviderCredentialStatus
  getLegacyStoreValue: (key: string) => unknown
}>

type ProviderCredentialStoreRecord = Readonly<{
  version: 1
  providerKey: ProviderCredentialKey
  backend: 'electron_safe_storage' | 'plaintext_fallback'
  ciphertextBase64?: string
  plaintext?: string
  updatedAtMs: number
}>

function secureStoreKey(providerKey: ProviderCredentialKey): string {
  return `${PROVIDER_CREDENTIAL_SECURE_STORE_KEY_PREFIX}${providerKey}`
}

export function providerCredentialSecureStoreKeys(): string[] {
  return PROVIDER_CREDENTIAL_KEYS.map(secureStoreKey)
}

export function isProviderCredentialSecureStoreKey(key: string): boolean {
  return key.startsWith(PROVIDER_CREDENTIAL_SECURE_STORE_KEY_PREFIX)
}

function providerKeyFromLegacyStoreKey(key: string): ProviderCredentialKey | null {
  for (const providerKey of PROVIDER_CREDENTIAL_KEYS) {
    if (PROVIDER_CREDENTIAL_LEGACY_STORE_KEYS[providerKey] === key) return providerKey
  }
  return null
}

function toBase64(value: Buffer | string): string {
  return Buffer.isBuffer(value)
    ? value.toString('base64')
    : Buffer.from(value, 'utf8').toString('base64')
}

function normalizeApiKey(value: unknown): string {
  return String(value ?? '').trim()
}

function missing(providerKey: ProviderCredentialKey, backend: ProviderCredentialBackendKind, warnings: string[] = []): ProviderCredentialReadResult {
  return {
    ok: false,
    providerKey,
    code: 'credential_missing',
    message: 'Provider API key is not configured.',
    source: 'missing',
    backend,
    warnings,
  }
}

function storeUnavailable(providerKey: ProviderCredentialKey, warnings: string[]): ProviderCredentialReadResult {
  return {
    ok: false,
    providerKey,
    code: 'store_unavailable',
    message: 'Provider credential store is unavailable.',
    source: 'missing',
    backend: 'unavailable',
    warnings,
  }
}

function isStoredRecord(value: unknown, providerKey: ProviderCredentialKey): value is ProviderCredentialStoreRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const record = value as Partial<ProviderCredentialStoreRecord>
  return record.version === 1 &&
    record.providerKey === providerKey &&
    (record.backend === 'electron_safe_storage' || record.backend === 'plaintext_fallback')
}

export function createProviderCredentialService(
  store: Store,
  options: ProviderCredentialServiceOptions,
): ProviderCredentialService {
  const nowMs = options.nowMs ?? Date.now
  const plaintextFallbackAllowed = options.allowPlaintextFallback === true

  function backendKind(): ProviderCredentialBackendKind {
    try {
      if (options.secureStorage.isEncryptionAvailable()) return 'electron_safe_storage'
    } catch {
      return plaintextFallbackAllowed ? 'plaintext_fallback' : 'unavailable'
    }
    return plaintextFallbackAllowed ? 'plaintext_fallback' : 'unavailable'
  }

  function writeApiKey(providerKey: ProviderCredentialKey, apiKey: string): Exclude<ProviderCredentialBackendKind, 'unavailable'> {
    const backend = backendKind()
    if (backend === 'electron_safe_storage') {
      const encrypted = options.secureStorage.encryptString(apiKey)
      store.set(secureStoreKey(providerKey), {
        version: 1,
        providerKey,
        backend,
        ciphertextBase64: toBase64(encrypted),
        updatedAtMs: nowMs(),
      } satisfies ProviderCredentialStoreRecord)
      return backend
    }

    if (backend === 'plaintext_fallback') {
      store.set(secureStoreKey(providerKey), {
        version: 1,
        providerKey,
        backend,
        plaintext: apiKey,
        updatedAtMs: nowMs(),
      } satisfies ProviderCredentialStoreRecord)
      return backend
    }

    throw new Error('secure credential backend unavailable')
  }

  function deleteLegacyApiKey(providerKey: ProviderCredentialKey) {
    store.delete(PROVIDER_CREDENTIAL_LEGACY_STORE_KEYS[providerKey])
  }

  function readStoredApiKey(providerKey: ProviderCredentialKey): ProviderCredentialReadResult | null {
    const raw = store.get(secureStoreKey(providerKey))
    if (!isStoredRecord(raw, providerKey)) return null

    try {
      if (raw.backend === 'electron_safe_storage') {
        const encrypted = Buffer.from(String(raw.ciphertextBase64 ?? ''), 'base64')
        const apiKey = normalizeApiKey(options.secureStorage.decryptString(encrypted))
        if (!apiKey) return missing(providerKey, 'electron_safe_storage')
        return {
          ok: true,
          providerKey,
          apiKey,
          source: 'secure_store',
          backend: 'electron_safe_storage',
          migratedFromLegacy: false,
          warnings: [],
        }
      }

      const apiKey = normalizeApiKey(raw.plaintext)
      if (!apiKey) return missing(providerKey, 'plaintext_fallback', [
        'Credential fallback record is present but empty.',
      ])
      return {
        ok: true,
        providerKey,
        apiKey,
        source: 'plaintext_fallback',
        backend: 'plaintext_fallback',
        migratedFromLegacy: false,
        warnings: ['OS secure storage is unavailable; credential is stored with plaintext fallback risk.'],
      }
    } catch {
      return storeUnavailable(providerKey, ['Stored provider credential could not be decrypted safely.'])
    }
  }

  function migrateLegacyApiKey(providerKey: ProviderCredentialKey, legacyApiKey: string): ProviderCredentialReadResult {
    try {
      const backend = writeApiKey(providerKey, legacyApiKey)
      deleteLegacyApiKey(providerKey)
      return {
        ok: true,
        providerKey,
        apiKey: legacyApiKey,
        source: backend === 'electron_safe_storage' ? 'secure_store' : 'plaintext_fallback',
        backend,
        migratedFromLegacy: true,
        warnings: backend === 'plaintext_fallback'
          ? ['Legacy credential migrated to plaintext fallback because OS secure storage is unavailable.']
          : [],
      }
    } catch {
      return storeUnavailable(providerKey, [
        'Legacy credential import failed. Re-enter the provider API key to create a secure credential record.',
      ])
    }
  }

  function readApiKey(providerKey: ProviderCredentialKey): ProviderCredentialReadResult {
    try {
      const stored = readStoredApiKey(providerKey)
      if (stored) return stored

      const legacyApiKey = normalizeApiKey(store.get(PROVIDER_CREDENTIAL_LEGACY_STORE_KEYS[providerKey]))
      if (legacyApiKey) return migrateLegacyApiKey(providerKey, legacyApiKey)

      return missing(providerKey, backendKind())
    } catch {
      return storeUnavailable(providerKey, [])
    }
  }

  function getStatus(providerKey: ProviderCredentialKey): ProviderCredentialStatus {
    const result = readApiKey(providerKey)
    if (!result.ok) {
      return {
        providerKey,
        source: 'missing',
        backend: result.backend,
        apiKeyConfigured: false,
        warnings: result.warnings,
      }
    }

    return {
      providerKey,
      source: result.source,
      backend: result.backend,
      apiKeyConfigured: true,
      maskedApiKey: '***',
      ...(result.migratedFromLegacy ? { migratedFromLegacy: true } : {}),
      warnings: result.warnings,
    }
  }

  function updateApiKey(providerKey: ProviderCredentialKey, apiKey: string): ProviderCredentialStatus {
    const normalized = normalizeApiKey(apiKey)
    if (!normalized) return getStatus(providerKey)

    const backend = writeApiKey(providerKey, normalized)
    deleteLegacyApiKey(providerKey)
    return {
      providerKey,
      source: backend === 'electron_safe_storage' ? 'secure_store' : 'plaintext_fallback',
      backend,
      apiKeyConfigured: true,
      maskedApiKey: '***',
      warnings: backend === 'plaintext_fallback'
        ? ['OS secure storage is unavailable; credential is stored with plaintext fallback risk.']
        : [],
    }
  }

  function clearApiKey(providerKey: ProviderCredentialKey): ProviderCredentialStatus {
    store.delete(secureStoreKey(providerKey))
    deleteLegacyApiKey(providerKey)
    return getStatus(providerKey)
  }

  function getLegacyStoreValue(key: string): unknown {
    const providerKey = providerKeyFromLegacyStoreKey(key)
    if (!providerKey) return store.get(key)
    const result = readApiKey(providerKey)
    return result.ok ? result.apiKey : undefined
  }

  return {
    readApiKey,
    getStatus,
    updateApiKey,
    clearApiKey,
    getLegacyStoreValue,
  }
}

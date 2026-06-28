import { describe, expect, it, vi } from 'vitest'
import {
  PROVIDER_CREDENTIAL_LEGACY_STORE_KEYS,
  PROVIDER_CREDENTIAL_SECURE_STORE_KEY_PREFIX,
  createProviderCredentialService,
  isProviderCredentialSecureStoreKey,
  providerCredentialSecureStoreKeys,
  type ProviderSecureStorageBackend,
} from './providerCredentialService'

function createStore(initial: Record<string, unknown> = {}) {
  const values = new Map<string, unknown>(Object.entries(initial))
  return {
    values,
    get: vi.fn((key: string) => values.get(key)),
    set: vi.fn((key: string, value: unknown) => {
      values.set(key, value)
    }),
    delete: vi.fn((key: string) => {
      values.delete(key)
    }),
  } as any
}

function createSecureBackend(input: Readonly<{ available?: boolean; failEncrypt?: boolean; failDecrypt?: boolean }> = {}): ProviderSecureStorageBackend {
  return {
    kind: 'electron_safe_storage',
    isEncryptionAvailable: () => input.available !== false,
    encryptString: (value) => {
      if (input.failEncrypt) throw new Error('Authorization: Bearer sk-should-not-leak')
      return Buffer.from(`encrypted:${value}`, 'utf8')
    },
    decryptString: (encrypted) => {
      if (input.failDecrypt) throw new Error('x-api-key: sk-should-not-leak')
      return encrypted.toString('utf8').replace(/^encrypted:/, '')
    },
  }
}

describe('providerCredentialService', () => {
  it('updates, reads, and clears a secure OpenRouter credential without storing it under the legacy key', () => {
    const store = createStore()
    const service = createProviderCredentialService(store, {
      secureStorage: createSecureBackend(),
      nowMs: () => 123,
    })

    const status = service.updateApiKey('openrouter', ' sk-openrouter-secure ')
    const read = service.readApiKey('openrouter')

    expect(status).toMatchObject({
      source: 'secure_store',
      backend: 'electron_safe_storage',
      apiKeyConfigured: true,
      maskedApiKey: '***',
    })
    expect(read).toMatchObject({
      ok: true,
      apiKey: 'sk-openrouter-secure',
      source: 'secure_store',
    })
    expect(store.set).not.toHaveBeenCalledWith(PROVIDER_CREDENTIAL_LEGACY_STORE_KEYS.openrouter, expect.anything())
    expect(store.values.get(`${PROVIDER_CREDENTIAL_SECURE_STORE_KEY_PREFIX}openrouter`)).toEqual(expect.objectContaining({
      backend: 'electron_safe_storage',
      ciphertextBase64: expect.any(String),
    }))
    expect(JSON.stringify(store.values.get(`${PROVIDER_CREDENTIAL_SECURE_STORE_KEY_PREFIX}openrouter`))).not.toContain('plaintext')
    expect(JSON.stringify(status)).not.toContain('sk-openrouter-secure')

    const clear = service.clearApiKey('openrouter')
    expect(clear).toMatchObject({ source: 'missing', apiKeyConfigured: false })
    expect(store.delete).toHaveBeenCalledWith(`${PROVIDER_CREDENTIAL_SECURE_STORE_KEY_PREFIX}openrouter`)
    expect(store.delete).toHaveBeenCalledWith(PROVIDER_CREDENTIAL_LEGACY_STORE_KEYS.openrouter)
  })

  it('migrates a legacy DeepSeek key into secure storage and deletes the legacy key', () => {
    const store = createStore({
      [PROVIDER_CREDENTIAL_LEGACY_STORE_KEYS.deepseek]: ' sk-deepseek-legacy ',
    })
    const service = createProviderCredentialService(store, {
      secureStorage: createSecureBackend(),
    })

    const read = service.readApiKey('deepseek')

    expect(read).toMatchObject({
      ok: true,
      apiKey: 'sk-deepseek-legacy',
      source: 'secure_store',
      backend: 'electron_safe_storage',
      migratedFromLegacy: true,
    })
    expect(store.set).toHaveBeenCalledWith(`${PROVIDER_CREDENTIAL_SECURE_STORE_KEY_PREFIX}deepseek`, expect.objectContaining({
      backend: 'electron_safe_storage',
      providerKey: 'deepseek',
    }))
    expect(store.delete).toHaveBeenCalledWith(PROVIDER_CREDENTIAL_LEGACY_STORE_KEYS.deepseek)
  })

  it('does not return a runtime raw key when legacy import write fails', () => {
    const store = createStore({
      [PROVIDER_CREDENTIAL_LEGACY_STORE_KEYS.anthropic]: 'sk-ant-legacy',
    })
    const service = createProviderCredentialService(store, {
      secureStorage: createSecureBackend({ failEncrypt: true }),
    })

    const read = service.readApiKey('anthropic')

    expect(read).toMatchObject({
      ok: false,
      code: 'store_unavailable',
      source: 'missing',
      backend: 'unavailable',
      warnings: ['Legacy credential import failed. Re-enter the provider API key to create a secure credential record.'],
    })
    expect(store.delete).not.toHaveBeenCalledWith(PROVIDER_CREDENTIAL_LEGACY_STORE_KEYS.anthropic)
    expect(JSON.stringify(read)).not.toContain('sk-ant-legacy')
    expect(service.getStatus('anthropic')).toMatchObject({
      source: 'missing',
      backend: 'unavailable',
      apiKeyConfigured: false,
    })
  })

  it('rejects new API key writes when secure storage is unavailable and plaintext fallback was not explicitly allowed', () => {
    const store = createStore()
    const service = createProviderCredentialService(store, {
      secureStorage: createSecureBackend({ available: false }),
    })

    expect(() => service.updateApiKey('google_ai_studio', 'AIza-google-key')).toThrow('secure credential backend unavailable')
    expect(store.set).not.toHaveBeenCalledWith(`${PROVIDER_CREDENTIAL_SECURE_STORE_KEY_PREFIX}google_ai_studio`, expect.anything())
    expect(service.getStatus('google_ai_studio')).toEqual({
      providerKey: 'google_ai_studio',
      source: 'missing',
      backend: 'unavailable',
      apiKeyConfigured: false,
      warnings: [],
    })
  })

  it('recognizes an existing plaintext fallback record in status without exposing the key', () => {
    const store = createStore({
      [`${PROVIDER_CREDENTIAL_SECURE_STORE_KEY_PREFIX}google_ai_studio`]: {
        version: 1,
        providerKey: 'google_ai_studio',
        backend: 'plaintext_fallback',
        plaintext: 'AIza-existing-plaintext-key',
        updatedAtMs: 123,
      },
    })
    const service = createProviderCredentialService(store, {
      secureStorage: createSecureBackend({ available: false }),
    })

    const status = service.getStatus('google_ai_studio')

    expect(status).toMatchObject({
      source: 'plaintext_fallback',
      backend: 'plaintext_fallback',
      apiKeyConfigured: true,
      maskedApiKey: '***',
    })
    expect(status.warnings.join(' ')).toContain('plaintext fallback')
    expect(JSON.stringify(status)).not.toContain('AIza-existing-plaintext-key')
  })

  it('clears secure and legacy secret records so old keys do not revive', () => {
    const store = createStore({
      [PROVIDER_CREDENTIAL_LEGACY_STORE_KEYS.openai_responses]: 'sk-openai-legacy',
    })
    const service = createProviderCredentialService(store, {
      secureStorage: createSecureBackend(),
    })

    expect(service.readApiKey('openai_responses')).toMatchObject({
      ok: true,
      source: 'secure_store',
      migratedFromLegacy: true,
    })
    store.values.set(PROVIDER_CREDENTIAL_LEGACY_STORE_KEYS.openai_responses, 'sk-openai-stale')

    const clear = service.clearApiKey('openai_responses')

    expect(clear).toMatchObject({
      source: 'missing',
      apiKeyConfigured: false,
    })
    expect(store.values.has(PROVIDER_CREDENTIAL_LEGACY_STORE_KEYS.openai_responses)).toBe(false)
    expect(service.readApiKey('openai_responses')).toMatchObject({
      ok: false,
      code: 'credential_missing',
    })
  })

  it('returns missing when neither secure nor legacy credential exists', () => {
    const service = createProviderCredentialService(createStore(), {
      secureStorage: createSecureBackend(),
    })

    expect(service.getStatus('openai_responses')).toMatchObject({
      source: 'missing',
      backend: 'electron_safe_storage',
      apiKeyConfigured: false,
    })
  })

  it('classifies secure credential store keys for renderer blocking', () => {
    expect(providerCredentialSecureStoreKeys()).toContain(`${PROVIDER_CREDENTIAL_SECURE_STORE_KEY_PREFIX}openrouter`)
    expect(isProviderCredentialSecureStoreKey(`${PROVIDER_CREDENTIAL_SECURE_STORE_KEY_PREFIX}deepseek`)).toBe(true)
    expect(isProviderCredentialSecureStoreKey('openRouterApiKey')).toBe(false)
  })
})

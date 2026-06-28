import { describe, expect, it, vi } from 'vitest'
import {
  registerOpenRouterCredentialSettingsIpc,
  OPENROUTER_CREDENTIAL_SETTINGS_IPC_CHANNELS,
} from './openRouterCredentialSettingsIpc'
import {
  PROVIDER_CREDENTIAL_SECURE_STORE_KEY_PREFIX,
  createProviderCredentialService,
  type ProviderSecureStorageBackend,
} from '../credentials/providerCredentialService'

const secureStorage: ProviderSecureStorageBackend = {
  kind: 'electron_safe_storage',
  isEncryptionAvailable: () => true,
  encryptString: (value) => Buffer.from(`encrypted:${value}`, 'utf8'),
  decryptString: (encrypted) => encrypted.toString('utf8').replace(/^encrypted:/, ''),
}

function registerHandlers(initialStore: Record<string, unknown> = {}) {
  const registerInvoke = vi.fn()
  const values = new Map<string, unknown>(Object.entries(initialStore))
  const store = {
    get: vi.fn((key: string) => values.get(key)),
    set: vi.fn((key: string, value: unknown) => {
      values.set(key, value)
    }),
    delete: vi.fn((key: string) => {
      values.delete(key)
    }),
  } as any

  const credentialService = createProviderCredentialService(store, {
    secureStorage,
    allowPlaintextFallback: true,
    nowMs: () => 123,
  })

  registerOpenRouterCredentialSettingsIpc({ registerInvoke, store, credentialService })

  const handlers = new Map<string, (...args: unknown[]) => unknown>()
  for (const [channel, handler] of registerInvoke.mock.calls) {
    handlers.set(channel, handler)
  }
  return { handlers, store, values }
}

function openRouterEndpointMetadata(
  overrides: Partial<{
    endpointId: 'openrouter-official' | 'openrouter-custom-legacy-store'
    endpointStatus: 'official' | 'custom' | 'invalid_custom'
    displayName: string
    baseUrlConfigured: boolean
    baseUrlInvalid: boolean
    displayBaseUrl: string
  }> = {},
) {
  const baseUrlConfigured = overrides.baseUrlConfigured ?? false
  const endpoint = {
    kind: 'openrouter_endpoint',
    endpointId: overrides.endpointId ?? (baseUrlConfigured ? 'openrouter-custom-legacy-store' : 'openrouter-official'),
    endpointStatus: overrides.endpointStatus ?? (baseUrlConfigured ? (overrides.baseUrlInvalid ? 'invalid_custom' : 'custom') : 'official'),
    providerId: 'openrouter',
    profileId: 'openrouter_v1_chat',
    displayName: overrides.displayName ?? (baseUrlConfigured ? 'OpenRouter custom endpoint' : 'OpenRouter official endpoint'),
    source: 'secure_store',
    baseUrlConfigured,
    ...(overrides.baseUrlInvalid ? { baseUrlInvalid: true } : {}),
    ...(overrides.displayBaseUrl ? { displayBaseUrl: overrides.displayBaseUrl } : {}),
    defaultBaseUrl: 'https://openrouter.ai/api/v1',
    credentialRef: { kind: 'credential_ref', id: 'openrouter-chat-legacy-store' },
    catalogCredentialRef: { kind: 'credential_ref', id: 'openrouter-catalog-legacy-store' },
    rendererVisible: true,
  }

  if (!baseUrlConfigured && !overrides.displayBaseUrl) {
    return { ...endpoint, displayBaseUrl: 'https://openrouter.ai/api/v1' }
  }

  return endpoint
}

describe('registerOpenRouterCredentialSettingsIpc', () => {
  it('registers the narrow OpenRouter credential settings channels', () => {
    const { handlers } = registerHandlers()

    expect([...handlers.keys()]).toEqual([...OPENROUTER_CREDENTIAL_SETTINGS_IPC_CHANNELS])
  })

  it('marks non-official stored base URL untrusted without returning URL userinfo/query', async () => {
    const rawKey = 'sk-openrouter-settings-secret'
    const { handlers } = registerHandlers({
      openRouterApiKey: ` ${rawKey} `,
      openRouterBaseUrl: `https://user:pass@openrouter.example.test/api/v1?token=${rawKey}#frag`,
    })

    const result = await handlers.get('openrouter-credential:get-status')?.({})

    expect(result).toEqual({
      ok: true,
      status: {
        source: 'secure_store',
        backend: 'electron_safe_storage',
        apiKeyConfigured: true,
        maskedApiKey: '***',
        migratedFromLegacy: true,
        warnings: [],
        baseUrlConfigured: true,
        baseUrlInvalid: true,
        defaultBaseUrl: 'https://openrouter.ai/api/v1',
        endpoint: openRouterEndpointMetadata({
          endpointId: 'openrouter-custom-legacy-store',
          endpointStatus: 'invalid_custom',
          displayName: 'OpenRouter custom endpoint',
          baseUrlConfigured: true,
          baseUrlInvalid: true,
        }),
      },
    })
    const serialized = JSON.stringify(result)
    expect(serialized).not.toContain(rawKey)
    expect(serialized).not.toContain('Bearer')
    expect(serialized).not.toContain('Authorization')
    expect(serialized).not.toContain('user:pass')
    expect(serialized).not.toContain('?token=')
    expect(serialized).not.toContain('openrouter.example.test')
    expect((result as any).status.endpoint.credentialRef).toEqual({
      kind: 'credential_ref',
      id: 'openrouter-chat-legacy-store',
    })
    expect((result as any).status.endpoint.catalogCredentialRef).toEqual({
      kind: 'credential_ref',
      id: 'openrouter-catalog-legacy-store',
    })
  })

  it('marks invalid stored base URL without returning it as editable display metadata', async () => {
    const rawKey = 'sk-openrouter-settings-secret'
    const rawBaseUrl = `https://user:pass@?token=${rawKey}`
    const { handlers } = registerHandlers({
      openRouterApiKey: rawKey,
      openRouterBaseUrl: rawBaseUrl,
    })

    const result = await handlers.get('openrouter-credential:get-status')?.({})

    expect(result).toEqual({
      ok: true,
      status: {
        source: 'secure_store',
        backend: 'electron_safe_storage',
        apiKeyConfigured: true,
        maskedApiKey: '***',
        migratedFromLegacy: true,
        warnings: [],
        baseUrlConfigured: true,
        baseUrlInvalid: true,
        defaultBaseUrl: 'https://openrouter.ai/api/v1',
        endpoint: openRouterEndpointMetadata({
          endpointId: 'openrouter-custom-legacy-store',
          endpointStatus: 'invalid_custom',
          displayName: 'OpenRouter custom endpoint',
          baseUrlConfigured: true,
          baseUrlInvalid: true,
        }),
      },
    })
    const serialized = JSON.stringify(result)
    expect(serialized).not.toContain(rawBaseUrl)
    expect(serialized).not.toContain(rawKey)
    expect(serialized).not.toContain('[invalid-url]')
    expect(serialized).not.toContain('user:pass')
    expect(serialized).not.toContain('?token=')
    expect((result as any).status.endpoint).not.toHaveProperty('displayBaseUrl')
  })

  it('returns official endpoint metadata when no custom base URL is configured', async () => {
    const { handlers } = registerHandlers({ openRouterApiKey: 'sk-openrouter-settings-secret' })

    const result = await handlers.get('openrouter-credential:get-status')?.({})

    expect(result).toEqual({
      ok: true,
      status: {
        source: 'secure_store',
        backend: 'electron_safe_storage',
        apiKeyConfigured: true,
        maskedApiKey: '***',
        migratedFromLegacy: true,
        warnings: [],
        baseUrlConfigured: false,
        defaultBaseUrl: 'https://openrouter.ai/api/v1',
        endpoint: openRouterEndpointMetadata(),
      },
    })
    expect(JSON.stringify(result)).not.toContain('sk-openrouter-settings-secret')
    expect((result as any).status.endpoint).toEqual(openRouterEndpointMetadata({
      endpointId: 'openrouter-official',
      endpointStatus: 'official',
      displayName: 'OpenRouter official endpoint',
      baseUrlConfigured: false,
      displayBaseUrl: 'https://openrouter.ai/api/v1',
    }))
  })

  it('updates API key and official base URL one-way through legacy store backing', async () => {
    const { handlers, store } = registerHandlers({
      openRouterApiKey: 'sk-old',
      openRouterBaseUrl: 'https://openrouter.ai/api/v1',
    })

    const result = await handlers.get('openrouter-credential:update')?.({}, {
      apiKey: ' sk-new-openrouter-key ',
      baseUrl: ' https://openrouter.ai/api/v1/ ',
    })

    expect(store.set).toHaveBeenCalledWith(`${PROVIDER_CREDENTIAL_SECURE_STORE_KEY_PREFIX}openrouter`, expect.objectContaining({
      backend: 'electron_safe_storage',
      providerKey: 'openrouter',
    }))
    expect(store.set).toHaveBeenCalledWith('openRouterBaseUrl', 'https://openrouter.ai/api/v1')
    expect(JSON.stringify(result)).not.toContain('sk-new-openrouter-key')
  })

  it('can update official base URL without requiring API key re-entry', async () => {
    const { handlers, store } = registerHandlers({
      openRouterApiKey: 'sk-existing',
      openRouterBaseUrl: 'https://openrouter.ai/api/v1',
    })

    const result = await handlers.get('openrouter-credential:update')?.({}, {
      baseUrl: 'https://openrouter.ai/api/v1/',
    })

    expect(store.set).toHaveBeenCalledWith(`${PROVIDER_CREDENTIAL_SECURE_STORE_KEY_PREFIX}openrouter`, expect.objectContaining({
      backend: 'electron_safe_storage',
      providerKey: 'openrouter',
    }))
    expect(store.set).toHaveBeenCalledWith('openRouterBaseUrl', 'https://openrouter.ai/api/v1')
    expect(JSON.stringify(result)).not.toContain('sk-existing')
  })

  it('rejects attacker base URL without overwriting an existing safe configuration', async () => {
    const { handlers, store, values } = registerHandlers({
      openRouterApiKey: 'sk-existing',
      openRouterBaseUrl: 'https://openrouter.ai/api/v1',
    })

    const result = await handlers.get('openrouter-credential:update')?.({}, {
      apiKey: 'sk-new-should-not-write',
      baseUrl: 'https://attacker.example.test/api/v1',
    })

    expect(result).toEqual({
      ok: false,
      code: 'untrusted_base_url',
      message: 'OpenRouter base URL is not trusted for the saved official credential.',
    })
    expect(store.set).not.toHaveBeenCalledWith('openRouterBaseUrl', expect.anything())
    expect(store.set).not.toHaveBeenCalledWith(`${PROVIDER_CREDENTIAL_SECURE_STORE_KEY_PREFIX}openrouter`, expect.anything())
    expect(values.get('openRouterBaseUrl')).toBe('https://openrouter.ai/api/v1')
    expect(JSON.stringify(result)).not.toContain('sk-new-should-not-write')
  })

  it('can update API key without requiring base URL re-entry', async () => {
    const { handlers, store } = registerHandlers({
      openRouterApiKey: 'sk-existing',
      openRouterBaseUrl: 'https://openrouter.ai/api/v1',
    })

    const result = await handlers.get('openrouter-credential:update')?.({}, {
      apiKey: 'sk-replacement',
    })

    expect(store.set).toHaveBeenCalledWith(`${PROVIDER_CREDENTIAL_SECURE_STORE_KEY_PREFIX}openrouter`, expect.objectContaining({
      backend: 'electron_safe_storage',
      providerKey: 'openrouter',
    }))
    expect(store.set).not.toHaveBeenCalledWith('openRouterBaseUrl', expect.anything())
    expect(JSON.stringify(result)).not.toContain('sk-replacement')
  })

  it('clear removes only the API key and preserves existing base URL semantics', async () => {
    const { handlers, store, values } = registerHandlers({
      openRouterApiKey: 'sk-existing',
      openRouterBaseUrl: 'https://openrouter.ai/api/v1',
    })

    const result = await handlers.get('openrouter-credential:clear')?.({})

    expect(store.delete).toHaveBeenCalledWith(`${PROVIDER_CREDENTIAL_SECURE_STORE_KEY_PREFIX}openrouter`)
    expect(store.delete).toHaveBeenCalledWith('openRouterApiKey')
    expect(store.delete).not.toHaveBeenCalledWith('openRouterBaseUrl')
    expect(values.get('openRouterBaseUrl')).toBe('https://openrouter.ai/api/v1')
    expect(JSON.stringify(result)).not.toContain('sk-existing')
  })

  it('clears base URL when update receives null', async () => {
    const { handlers, store } = registerHandlers({
      openRouterApiKey: 'sk-existing',
      openRouterBaseUrl: 'https://openrouter.ai/api/v1',
    })

    await handlers.get('openrouter-credential:update')?.({}, { baseUrl: null })

    expect(store.delete).toHaveBeenCalledWith('openRouterBaseUrl')
    expect(store.delete).not.toHaveBeenCalledWith(`${PROVIDER_CREDENTIAL_SECURE_STORE_KEY_PREFIX}openrouter`)
    expect(store.delete).toHaveBeenCalledWith('openRouterApiKey')
  })

  it('fails invalid payloads and store errors safely', async () => {
    const rawKey = 'sk-malicious-store-detail'
    const { handlers, store } = registerHandlers({ openRouterApiKey: rawKey })
    store.get.mockImplementationOnce(() => {
      throw new Error(`Bearer ${rawKey} Authorization header leaked`)
    })

    const invalid = await handlers.get('openrouter-credential:update')?.({}, { apiKey: 123 })
    const failure = await handlers.get('openrouter-credential:get-status')?.({})

    expect(invalid).toEqual({
      ok: false,
      code: 'invalid_payload',
      message: 'OpenRouter credential settings payload is invalid.',
    })
    expect(failure).toMatchObject({
      ok: true,
      status: {
        source: 'missing',
        backend: 'unavailable',
        apiKeyConfigured: false,
      },
    })
    const serialized = JSON.stringify([invalid, failure])
    expect(serialized).not.toContain(rawKey)
    expect(serialized).not.toContain('Bearer')
    expect(serialized).not.toContain('Authorization')
  })
})

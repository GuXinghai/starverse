import { describe, expect, it, vi } from 'vitest'
import {
  OPENROUTER_CREDENTIAL_SETTINGS_IPC_CHANNELS,
  registerOpenRouterCredentialSettingsIpc,
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
    set: vi.fn((key: string, value: unknown) => values.set(key, value)),
    delete: vi.fn((key: string) => values.delete(key)),
  } as any
  const credentialService = createProviderCredentialService(store, {
    secureStorage,
    allowPlaintextFallback: true,
    nowMs: () => 123,
  })
  registerOpenRouterCredentialSettingsIpc({ registerInvoke, credentialService })
  const handlers = new Map<string, (...args: unknown[]) => unknown>()
  for (const [channel, handler] of registerInvoke.mock.calls) handlers.set(channel, handler)
  return { handlers, store }
}

describe('registerOpenRouterCredentialSettingsIpc', () => {
  it('registers only the credential settings channels', () => {
    const { handlers } = registerHandlers()
    expect([...handlers.keys()]).toEqual([...OPENROUTER_CREDENTIAL_SETTINGS_IPC_CHANNELS])
  })

  it('reports only the official endpoint and never reads a custom base URL', async () => {
    const { handlers } = registerHandlers({
      openRouterApiKey: 'sk-openrouter-secret',
    })
    const result = await handlers.get('openrouter-credential:get-status')?.({})

    expect(result).toMatchObject({
      ok: true,
      status: {
        apiKeyConfigured: true,
        baseUrlConfigured: false,
        displayBaseUrl: 'https://openrouter.ai/api/v1',
        endpoint: {
          endpointId: 'openrouter-official',
          endpointStatus: 'official',
          displayBaseUrl: 'https://openrouter.ai/api/v1',
        },
      },
    })
    expect(JSON.stringify(result)).not.toContain('sk-openrouter-secret')
    expect(JSON.stringify(result)).not.toContain('attacker.example.test')
  })

  it('updates and clears only the API key', async () => {
    const { handlers, store } = registerHandlers()
    const update = await handlers.get('openrouter-credential:update')?.({}, { apiKey: ' sk-new ' })
    expect(update).toMatchObject({ ok: true, status: { apiKeyConfigured: true } })
    expect(store.set).toHaveBeenCalledWith(
      `${PROVIDER_CREDENTIAL_SECURE_STORE_KEY_PREFIX}openrouter`,
      expect.objectContaining({ providerKey: 'openrouter' }),
    )

    const clear = await handlers.get('openrouter-credential:clear')?.({})
    expect(clear).toMatchObject({ ok: true, status: { apiKeyConfigured: false } })
  })

  it('rejects legacy base URL payloads before changing credentials', async () => {
    const { handlers, store } = registerHandlers()
    const result = await handlers.get('openrouter-credential:update')?.({}, {
      apiKey: 'sk-must-not-write',
      baseUrl: 'https://openrouter.ai/api/v1',
    })
    expect(result).toEqual({
      ok: false,
      code: 'invalid_payload',
      message: 'OpenRouter credential settings payload is invalid.',
    })
    expect(store.set).not.toHaveBeenCalledWith(
      `${PROVIDER_CREDENTIAL_SECURE_STORE_KEY_PREFIX}openrouter`,
      expect.anything(),
    )
  })
})

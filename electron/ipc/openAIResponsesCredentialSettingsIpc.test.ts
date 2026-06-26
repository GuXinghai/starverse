import { describe, expect, it, vi } from 'vitest'
import {
  OPENAI_RESPONSES_API_KEY_STORE_KEY,
  registerOpenAIResponsesCredentialSettingsIpc,
} from './openAIResponsesCredentialSettingsIpc'
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

function registerHandlers(initialStore?: Record<string, unknown>) {
  const registerInvoke = vi.fn()
  const values = new Map<string, unknown>(Object.entries(initialStore ?? {}))
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
  registerOpenAIResponsesCredentialSettingsIpc({ registerInvoke, credentialService })
  const handlers = new Map<string, (...args: unknown[]) => unknown>()
  for (const [channel, handler] of registerInvoke.mock.calls) {
    handlers.set(channel, handler)
  }
  return { handlers, store, values }
}

describe('openAIResponsesCredentialSettingsIpc', () => {
  it('returns masked configured status without exposing the raw API key', async () => {
    const { handlers } = registerHandlers({ [OPENAI_RESPONSES_API_KEY_STORE_KEY]: 'sk-openai-secret' })

    const result = await handlers.get('openai-responses-credential:get-status')?.({})

    expect(result).toMatchObject({
      ok: true,
      status: {
        source: 'secure_store',
        backend: 'electron_safe_storage',
        providerId: 'openai',
        profileId: 'openai_responses_v1',
        apiKeyConfigured: true,
        maskedApiKey: '***',
        migratedFromLegacy: true,
        warnings: [],
        defaultBaseUrl: 'https://api.openai.com/v1',
        rendererVisible: true,
      },
    })
    expect(JSON.stringify(result)).not.toContain('sk-openai-secret')
    expect(JSON.stringify(result)).not.toContain('Bearer')
    expect(JSON.stringify(result)).not.toContain('Authorization')
  })

  it('updates and clears the service-backed API key without returning it', async () => {
    const { handlers, store } = registerHandlers()

    const updateResult = await handlers.get('openai-responses-credential:update')?.({}, {
      apiKey: '  sk-openai-updated  ',
    })
    const clearResult = await handlers.get('openai-responses-credential:clear')?.({})

    expect(store.set).toHaveBeenCalledWith(`${PROVIDER_CREDENTIAL_SECURE_STORE_KEY_PREFIX}openai_responses`, expect.objectContaining({
      backend: 'electron_safe_storage',
      providerKey: 'openai_responses',
    }))
    expect(store.delete).toHaveBeenCalledWith(OPENAI_RESPONSES_API_KEY_STORE_KEY)
    expect(JSON.stringify(updateResult)).not.toContain('sk-openai-updated')
    expect(JSON.stringify(clearResult)).not.toContain('sk-openai-updated')
  })

  it('fails invalid payloads with a static safe message', async () => {
    const { handlers, store } = registerHandlers()

    const result = await handlers.get('openai-responses-credential:update')?.({}, {
      apiKey: { raw: 'sk-openai-secret' },
    })

    expect(result).toEqual({
      ok: false,
      code: 'invalid_payload',
      message: 'OpenAI Responses credential settings payload is invalid.',
    })
    expect(store.set).not.toHaveBeenCalled()
    expect(JSON.stringify(result)).not.toContain('sk-openai-secret')
  })
})

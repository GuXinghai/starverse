import { describe, expect, it, vi } from 'vitest'
import {
  registerOpenRouterCredentialSettingsIpc,
  OPENROUTER_CREDENTIAL_SETTINGS_IPC_CHANNELS,
} from './openRouterCredentialSettingsIpc'

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

  registerOpenRouterCredentialSettingsIpc({ registerInvoke, store })

  const handlers = new Map<string, (...args: unknown[]) => unknown>()
  for (const [channel, handler] of registerInvoke.mock.calls) {
    handlers.set(channel, handler)
  }
  return { handlers, store, values }
}

describe('registerOpenRouterCredentialSettingsIpc', () => {
  it('registers the narrow OpenRouter credential settings channels', () => {
    const { handlers } = registerHandlers()

    expect([...handlers.keys()]).toEqual([...OPENROUTER_CREDENTIAL_SETTINGS_IPC_CHANNELS])
  })

  it('returns safe configured status without raw key or URL userinfo/query', async () => {
    const rawKey = 'sk-openrouter-settings-secret'
    const { handlers } = registerHandlers({
      openRouterApiKey: ` ${rawKey} `,
      openRouterBaseUrl: `https://user:pass@openrouter.example.test/api/v1?token=${rawKey}#frag`,
    })

    const result = await handlers.get('openrouter-credential:get-status')?.({})

    expect(result).toEqual({
      ok: true,
      status: {
        source: 'legacy_store',
        apiKeyConfigured: true,
        maskedApiKey: '***',
        baseUrlConfigured: true,
        displayBaseUrl: 'https://openrouter.example.test/api/v1',
        defaultBaseUrl: 'https://openrouter.ai/api/v1',
      },
    })
    const serialized = JSON.stringify(result)
    expect(serialized).not.toContain(rawKey)
    expect(serialized).not.toContain('Bearer')
    expect(serialized).not.toContain('Authorization')
    expect(serialized).not.toContain('user:pass')
    expect(serialized).not.toContain('?token=')
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
        source: 'legacy_store',
        apiKeyConfigured: true,
        maskedApiKey: '***',
        baseUrlConfigured: true,
        baseUrlInvalid: true,
        defaultBaseUrl: 'https://openrouter.ai/api/v1',
      },
    })
    const serialized = JSON.stringify(result)
    expect(serialized).not.toContain(rawBaseUrl)
    expect(serialized).not.toContain(rawKey)
    expect(serialized).not.toContain('[invalid-url]')
    expect(serialized).not.toContain('user:pass')
    expect(serialized).not.toContain('?token=')
  })

  it('updates API key and base URL one-way through legacy store backing', async () => {
    const { handlers, store } = registerHandlers({
      openRouterApiKey: 'sk-old',
      openRouterBaseUrl: 'https://openrouter.ai/api/v1',
    })

    const result = await handlers.get('openrouter-credential:update')?.({}, {
      apiKey: ' sk-new-openrouter-key ',
      baseUrl: ' https://openrouter-proxy.example.test/api/v1 ',
    })

    expect(store.set).toHaveBeenCalledWith('openRouterApiKey', 'sk-new-openrouter-key')
    expect(store.set).toHaveBeenCalledWith('openRouterBaseUrl', 'https://openrouter-proxy.example.test/api/v1')
    expect(JSON.stringify(result)).not.toContain('sk-new-openrouter-key')
  })

  it('can update base URL without requiring API key re-entry', async () => {
    const { handlers, store } = registerHandlers({
      openRouterApiKey: 'sk-existing',
      openRouterBaseUrl: 'https://openrouter.ai/api/v1',
    })

    const result = await handlers.get('openrouter-credential:update')?.({}, {
      baseUrl: 'https://openrouter-proxy.example.test/api/v1',
    })

    expect(store.set).not.toHaveBeenCalledWith('openRouterApiKey', expect.anything())
    expect(store.set).toHaveBeenCalledWith('openRouterBaseUrl', 'https://openrouter-proxy.example.test/api/v1')
    expect(JSON.stringify(result)).not.toContain('sk-existing')
  })

  it('can update API key without requiring base URL re-entry', async () => {
    const { handlers, store } = registerHandlers({
      openRouterApiKey: 'sk-existing',
      openRouterBaseUrl: 'https://openrouter.ai/api/v1',
    })

    const result = await handlers.get('openrouter-credential:update')?.({}, {
      apiKey: 'sk-replacement',
    })

    expect(store.set).toHaveBeenCalledWith('openRouterApiKey', 'sk-replacement')
    expect(store.set).not.toHaveBeenCalledWith('openRouterBaseUrl', expect.anything())
    expect(JSON.stringify(result)).not.toContain('sk-replacement')
  })

  it('clear removes only the API key and preserves existing base URL semantics', async () => {
    const { handlers, store, values } = registerHandlers({
      openRouterApiKey: 'sk-existing',
      openRouterBaseUrl: 'https://openrouter.ai/api/v1',
    })

    const result = await handlers.get('openrouter-credential:clear')?.({})

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
    expect(store.delete).not.toHaveBeenCalledWith('openRouterApiKey')
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
    expect(failure).toEqual({
      ok: false,
      code: 'store_unavailable',
      message: 'OpenRouter credential settings store is unavailable.',
    })
    const serialized = JSON.stringify([invalid, failure])
    expect(serialized).not.toContain(rawKey)
    expect(serialized).not.toContain('Bearer')
    expect(serialized).not.toContain('Authorization')
  })
})

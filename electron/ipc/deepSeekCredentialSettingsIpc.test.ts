import { describe, expect, it, vi } from 'vitest'
import {
  DEEPSEEK_API_KEY_STORE_KEY,
  registerDeepSeekCredentialSettingsIpc,
} from './deepSeekCredentialSettingsIpc'

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
  registerDeepSeekCredentialSettingsIpc({ registerInvoke, store })
  const handlers = new Map<string, (...args: unknown[]) => unknown>()
  for (const [channel, handler] of registerInvoke.mock.calls) {
    handlers.set(channel, handler)
  }
  return { handlers, store, values }
}

describe('deepSeekCredentialSettingsIpc', () => {
  it('returns masked configured status without exposing the raw API key', async () => {
    const { handlers } = registerHandlers({ [DEEPSEEK_API_KEY_STORE_KEY]: 'sk-deepseek-secret' })

    const result = await handlers.get('deepseek-credential:get-status')?.({})

    expect(result).toMatchObject({
      ok: true,
      status: {
        source: 'legacy_store',
        providerId: 'deepseek',
        profileId: 'deepseek_official_openai_compat',
        apiKeyConfigured: true,
        maskedApiKey: '***',
        defaultBaseUrl: 'https://api.deepseek.com/v1',
        rendererVisible: true,
      },
    })
    expect(JSON.stringify(result)).not.toContain('sk-deepseek-secret')
    expect(JSON.stringify(result)).not.toContain('Bearer')
    expect(JSON.stringify(result)).not.toContain('Authorization')
  })

  it('updates and clears the legacy-store backed API key without returning it', async () => {
    const { handlers, store } = registerHandlers()

    const updateResult = await handlers.get('deepseek-credential:update')?.({}, {
      apiKey: '  sk-deepseek-updated  ',
    })
    const clearResult = await handlers.get('deepseek-credential:clear')?.({})

    expect(store.set).toHaveBeenCalledWith(DEEPSEEK_API_KEY_STORE_KEY, 'sk-deepseek-updated')
    expect(store.delete).toHaveBeenCalledWith(DEEPSEEK_API_KEY_STORE_KEY)
    expect(JSON.stringify(updateResult)).not.toContain('sk-deepseek-updated')
    expect(JSON.stringify(clearResult)).not.toContain('sk-deepseek-updated')
  })

  it('fails invalid payloads with a static safe message', async () => {
    const { handlers, store } = registerHandlers()

    const result = await handlers.get('deepseek-credential:update')?.({}, {
      apiKey: { raw: 'sk-deepseek-secret' },
    })

    expect(result).toEqual({
      ok: false,
      code: 'invalid_payload',
      message: 'DeepSeek credential settings payload is invalid.',
    })
    expect(store.set).not.toHaveBeenCalled()
    expect(JSON.stringify(result)).not.toContain('sk-deepseek-secret')
  })
})

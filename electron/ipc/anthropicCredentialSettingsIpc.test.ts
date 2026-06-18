import { describe, expect, it, vi } from 'vitest'
import {
  ANTHROPIC_API_KEY_STORE_KEY,
  registerAnthropicCredentialSettingsIpc,
} from './anthropicCredentialSettingsIpc'

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
  registerAnthropicCredentialSettingsIpc({ registerInvoke, store })
  const handlers = new Map<string, (...args: unknown[]) => unknown>()
  for (const [channel, handler] of registerInvoke.mock.calls) {
    handlers.set(channel, handler)
  }
  return { handlers, store, values }
}

describe('anthropicCredentialSettingsIpc', () => {
  it('returns masked configured status without exposing the raw API key', async () => {
    const { handlers } = registerHandlers({ [ANTHROPIC_API_KEY_STORE_KEY]: 'sk-ant-secret' })

    const result = await handlers.get('anthropic-credential:get-status')?.({})

    expect(result).toMatchObject({
      ok: true,
      status: {
        source: 'legacy_store',
        providerId: 'anthropic',
        profileId: 'anthropic_messages_v1',
        apiKeyConfigured: true,
        maskedApiKey: '***',
        defaultBaseUrl: 'https://api.anthropic.com/v1',
        rendererVisible: true,
      },
    })
    expect(JSON.stringify(result)).not.toContain('sk-ant-secret')
    expect(JSON.stringify(result)).not.toContain('Bearer')
    expect(JSON.stringify(result)).not.toContain('Authorization')
  })

  it('updates and clears the legacy-store backed API key without returning it', async () => {
    const { handlers, store } = registerHandlers()

    const updateResult = await handlers.get('anthropic-credential:update')?.({}, {
      apiKey: '  sk-ant-updated  ',
    })
    const clearResult = await handlers.get('anthropic-credential:clear')?.({})

    expect(store.set).toHaveBeenCalledWith(ANTHROPIC_API_KEY_STORE_KEY, 'sk-ant-updated')
    expect(store.delete).toHaveBeenCalledWith(ANTHROPIC_API_KEY_STORE_KEY)
    expect(JSON.stringify(updateResult)).not.toContain('sk-ant-updated')
    expect(JSON.stringify(clearResult)).not.toContain('sk-ant-updated')
  })

  it('fails invalid payloads with a static safe message', async () => {
    const { handlers, store } = registerHandlers()

    const result = await handlers.get('anthropic-credential:update')?.({}, {
      apiKey: { raw: 'sk-ant-secret' },
    })

    expect(result).toEqual({
      ok: false,
      code: 'invalid_payload',
      message: 'Anthropic credential settings payload is invalid.',
    })
    expect(store.set).not.toHaveBeenCalled()
    expect(JSON.stringify(result)).not.toContain('sk-ant-secret')
  })
})

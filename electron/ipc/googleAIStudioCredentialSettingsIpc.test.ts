import { describe, expect, it, vi } from 'vitest'
import {
  GOOGLE_AI_STUDIO_API_KEY_STORE_KEY,
  registerGoogleAIStudioCredentialSettingsIpc,
} from './googleAIStudioCredentialSettingsIpc'

function registerWithStore(store: any) {
  const registerInvoke = vi.fn()
  registerGoogleAIStudioCredentialSettingsIpc({ registerInvoke, store })
  return {
    get: registerInvoke.mock.calls.find(([channel]) => channel === 'google-ai-studio-credential:get-status')?.[1],
    update: registerInvoke.mock.calls.find(([channel]) => channel === 'google-ai-studio-credential:update')?.[1],
    clear: registerInvoke.mock.calls.find(([channel]) => channel === 'google-ai-studio-credential:clear')?.[1],
  }
}

describe('googleAIStudioCredentialSettingsIpc', () => {
  it('returns masked Google AI Studio credential status without raw API key', async () => {
    const store = {
      get: vi.fn((key: string) => key === GOOGLE_AI_STUDIO_API_KEY_STORE_KEY ? 'AIza-raw-google-secret' : undefined),
      set: vi.fn(),
      delete: vi.fn(),
    }
    const handlers = registerWithStore(store)

    const result = await handlers.get({})

    expect(result).toMatchObject({
      ok: true,
      status: {
        source: 'legacy_store',
        providerId: 'google-ai-studio',
        profileId: 'gemini_api_v1',
        apiKeyConfigured: true,
        maskedApiKey: '***',
        defaultBaseUrl: 'https://generativelanguage.googleapis.com',
        rendererVisible: true,
      },
    })
    const serialized = JSON.stringify(result)
    expect(serialized).not.toContain('AIza-raw-google-secret')
    expect(serialized).not.toContain('Authorization')
    expect(serialized).not.toContain('Bearer')
  })

  it('updates and clears Google AI Studio API key through the narrow bridge only', async () => {
    const values = new Map<string, unknown>()
    const store = {
      get: vi.fn((key: string) => values.get(key)),
      set: vi.fn((key: string, value: unknown) => values.set(key, value)),
      delete: vi.fn((key: string) => values.delete(key)),
    }
    const handlers = registerWithStore(store)

    const update = await handlers.update({}, { apiKey: ' AIza-new-google-key ' })
    expect(update).toMatchObject({ ok: true, status: { apiKeyConfigured: true, maskedApiKey: '***' } })
    expect(store.set).toHaveBeenCalledWith(GOOGLE_AI_STUDIO_API_KEY_STORE_KEY, 'AIza-new-google-key')
    expect(JSON.stringify(update)).not.toContain('AIza-new-google-key')

    const clear = await handlers.clear({})
    expect(clear).toMatchObject({ ok: true, status: { apiKeyConfigured: false } })
    expect(store.delete).toHaveBeenCalledWith(GOOGLE_AI_STUDIO_API_KEY_STORE_KEY)
  })

  it('fails safely for invalid payload and store failures', async () => {
    const handlers = registerWithStore({
      get: vi.fn(() => {
        throw new Error('AIza-raw-google-secret')
      }),
      set: vi.fn(),
      delete: vi.fn(),
    })

    expect(await handlers.update({}, { apiKey: 123 })).toEqual({
      ok: false,
      code: 'invalid_payload',
      message: 'Google AI Studio credential settings payload is invalid.',
    })
    const result = await handlers.get({})
    expect(result).toEqual({
      ok: false,
      code: 'store_unavailable',
      message: 'Google AI Studio credential settings store is unavailable.',
    })
    expect(JSON.stringify(result)).not.toContain('AIza-raw-google-secret')
  })
})

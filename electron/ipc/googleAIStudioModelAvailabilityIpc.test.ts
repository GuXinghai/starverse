import { describe, expect, it, vi } from 'vitest'
import {
  GOOGLE_AI_STUDIO_MODEL_AVAILABILITY_IPC_CHANNELS,
  registerGoogleAIStudioModelAvailabilityIpc,
} from './googleAIStudioModelAvailabilityIpc'
import type { ProviderCredentialService } from '../credentials/providerCredentialService'

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function createCredentialService(apiKey?: string): ProviderCredentialService {
  return {
    readApiKey: vi.fn(() => apiKey
      ? { ok: true, providerKey: 'google_ai_studio', apiKey, source: 'secure_store', backend: 'electron_safe_storage', migratedFromLegacy: false, warnings: [] }
      : { ok: false, providerKey: 'google_ai_studio', code: 'credential_missing', message: 'missing', source: 'missing', backend: 'electron_safe_storage', warnings: [] }),
  } as unknown as ProviderCredentialService
}

function registerHandler(input: Readonly<{
  googleAIStudioApiKey?: string
  geminiApiKey?: string
  fetchImpl?: typeof fetch
}>) {
  const registerInvoke = vi.fn()
  const credentialService = createCredentialService(input.googleAIStudioApiKey)
  registerGoogleAIStudioModelAvailabilityIpc({
    registerInvoke,
    credentialService,
    fetchImpl: input.fetchImpl ?? vi.fn() as unknown as typeof fetch,
  })
  const handler = registerInvoke.mock.calls.find(([channel]) => channel === 'google-ai-studio-models:list-availability')?.[1]
  expect(handler).toBeTypeOf('function')
  return { credentialService, registerInvoke, handler: handler as (...args: unknown[]) => Promise<unknown> }
}

describe('googleAIStudioModelAvailabilityIpc', () => {
  it('registers only the Google AI Studio model availability channel', () => {
    const { registerInvoke } = registerHandler({})

    expect(registerInvoke.mock.calls.map(([channel]) => channel)).toEqual([
      ...GOOGLE_AI_STUDIO_MODEL_AVAILABILITY_IPC_CHANNELS,
    ])
  })

  it('rejects renderer payloads that try to pass an API key', async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch
    const { handler } = registerHandler({ googleAIStudioApiKey: 'AIza-main-secret', fetchImpl })

    const result = await handler({}, {
      apiKey: 'AIza-renderer-secret',
      timeoutMs: 1000,
    })

    expect(result).toMatchObject({
      ok: false,
      code: 'invalid_payload',
      message: 'Google AI Studio model availability payload must not include credentials.',
    })
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(JSON.stringify(result)).not.toContain('AIza-renderer-secret')
    expect(JSON.stringify(result)).not.toContain('AIza-main-secret')
  })

  it('fails before fetch when the main-process Google AI Studio credential is missing', async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch
    const { handler, credentialService } = registerHandler({ geminiApiKey: 'legacy-gemini-secret', fetchImpl })

    const result = await handler({}, { timeoutMs: 1000 })

    expect(result).toMatchObject({
      ok: false,
      providerKey: 'google_ai_studio',
      endpointId: 'google-ai-studio-official',
      profileId: 'gemini_api_v1',
      code: 'credential_missing',
      message: 'Google AI Studio API key is not configured.',
    })
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(credentialService.readApiKey).toHaveBeenCalledWith('google_ai_studio')
  })

  it('redacts provider HTTP errors before returning them to renderer', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({
      error: {
        message: 'x-goog-api-key AIza-google-secret failed',
        code: 'AIza-google-secret',
      },
    }, 403)) as unknown as typeof fetch
    const { handler } = registerHandler({ googleAIStudioApiKey: 'AIza-google-secret', fetchImpl })

    const result = await handler({}, { timeoutMs: 1000 })

    expect(result).toMatchObject({
      ok: false,
      code: 'http_error',
      httpStatus: 403,
      message: 'Google AI Studio model source credential was rejected.',
    })
    const serialized = JSON.stringify(result)
    expect(serialized).not.toContain('AIza-google-secret')
    expect(serialized).not.toContain('x-goog-api-key')
    expect(serialized).not.toContain('Bearer')
  })

  it('fetches models.list with a main-process x-goog-api-key credential and returns safe availability records', async () => {
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/models?pageSize=100')
      expect(init?.method).toBe('GET')
      expect(init?.redirect).toBe('error')
      expect((init?.headers as Record<string, string>)?.['x-goog-api-key']).toBe('AIza-google-secret')
      return jsonResponse({
        models: [
          {
            name: 'models/gemini-2.5-flash',
            displayName: 'Gemini 2.5 Flash',
            supportedGenerationMethods: ['generateContent', 'countTokens'],
            inputTokenLimit: 1048576,
            outputTokenLimit: 65536,
          },
        ],
      })
    }) as unknown as typeof fetch
    const { handler } = registerHandler({ googleAIStudioApiKey: 'AIza-google-secret', fetchImpl })

    const result = await handler({}, { timeoutMs: 1000 })

    expect(result).toMatchObject({
      ok: true,
      providerKey: 'google_ai_studio',
      endpointId: 'google-ai-studio-official',
      profileId: 'gemini_api_v1',
    })
    const serialized = JSON.stringify(result)
    expect(serialized).toContain('gemini-2.5-flash')
    expect(serialized).toContain('gemini_models_api')
    expect(serialized).toContain('provider_reported')
    expect(serialized).toContain('gemini_models_api_docs')
    expect(serialized).not.toContain('AIza-google-secret')
    expect(serialized).not.toContain('x-goog-api-key')
    expect(serialized).not.toContain('Bearer')
  })
})

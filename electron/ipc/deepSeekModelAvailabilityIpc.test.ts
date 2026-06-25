import { describe, expect, it, vi } from 'vitest'
import { DEEPSEEK_API_KEY_STORE_KEY } from './deepSeekCredentialSettingsIpc'
import {
  DEEPSEEK_MODEL_AVAILABILITY_IPC_CHANNELS,
  registerDeepSeekModelAvailabilityIpc,
} from './deepSeekModelAvailabilityIpc'

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function createStore(apiKey?: string) {
  return {
    get: vi.fn((key: string) => key === DEEPSEEK_API_KEY_STORE_KEY ? apiKey : undefined),
  } as any
}

function registerHandler(input: Readonly<{ apiKey?: string; fetchImpl?: typeof fetch }>) {
  const registerInvoke = vi.fn()
  registerDeepSeekModelAvailabilityIpc({
    registerInvoke,
    store: createStore(input.apiKey),
    fetchImpl: input.fetchImpl ?? vi.fn() as unknown as typeof fetch,
  })
  const handler = registerInvoke.mock.calls.find(([channel]) => channel === 'deepseek-models:list-availability')?.[1]
  expect(handler).toBeTypeOf('function')
  return { registerInvoke, handler: handler as (...args: unknown[]) => Promise<unknown> }
}

describe('deepSeekModelAvailabilityIpc', () => {
  it('registers only the DeepSeek model availability channel', () => {
    const { registerInvoke } = registerHandler({})

    expect(registerInvoke.mock.calls.map(([channel]) => channel)).toEqual([
      ...DEEPSEEK_MODEL_AVAILABILITY_IPC_CHANNELS,
    ])
  })

  it('rejects renderer payloads that try to pass an API key', async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch
    const { handler } = registerHandler({ apiKey: 'sk-main-secret', fetchImpl })

    const result = await handler({}, {
      apiKey: 'sk-renderer-secret',
      timeoutMs: 1000,
    })

    expect(result).toMatchObject({
      ok: false,
      code: 'invalid_payload',
      message: 'DeepSeek model availability payload must not include credentials.',
    })
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(JSON.stringify(result)).not.toContain('sk-renderer-secret')
    expect(JSON.stringify(result)).not.toContain('sk-main-secret')
  })

  it('fails before fetch when the main-process credential is missing', async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch
    const { handler } = registerHandler({ fetchImpl })

    const result = await handler({}, { timeoutMs: 1000 })

    expect(result).toMatchObject({
      ok: false,
      providerKey: 'deepseek',
      endpointId: 'deepseek-official',
      profileId: 'deepseek_official_openai_compat',
      code: 'credential_missing',
      message: 'DeepSeek API key is not configured.',
    })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('redacts provider HTTP errors before returning them to renderer', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({
      error: {
        message: 'Authorization: Bearer sk-deepseek-secret failed',
        code: 'sk-deepseek-secret',
      },
    }, 401)) as unknown as typeof fetch
    const { handler } = registerHandler({ apiKey: 'sk-deepseek-secret', fetchImpl })

    const result = await handler({}, { timeoutMs: 1000 })

    expect(result).toMatchObject({
      ok: false,
      code: 'http_error',
      httpStatus: 401,
      message: 'DeepSeek model source credential was rejected.',
    })
    const serialized = JSON.stringify(result)
    expect(serialized).not.toContain('sk-deepseek-secret')
    expect(serialized).not.toContain('Authorization')
    expect(serialized).not.toContain('Bearer')
  })

  it('fetches /models with a main-process bearer credential and returns safe availability records', async () => {
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe('https://api.deepseek.com/models')
      expect(init?.method).toBe('GET')
      expect(init?.redirect).toBe('error')
      expect((init?.headers as Record<string, string>)?.Authorization).toBe('Bearer sk-deepseek-secret')
      return jsonResponse({
        object: 'list',
        data: [
          { id: 'deepseek-v4-flash', object: 'model', owned_by: 'deepseek' },
          { id: 'deepseek-v4-pro', object: 'model', owned_by: 'deepseek' },
        ],
      })
    }) as unknown as typeof fetch
    const { handler } = registerHandler({ apiKey: 'sk-deepseek-secret', fetchImpl })

    const result = await handler({}, { timeoutMs: 1000 })

    expect(result).toMatchObject({
      ok: true,
      providerKey: 'deepseek',
      endpointId: 'deepseek-official',
      profileId: 'deepseek_official_openai_compat',
    })
    const serialized = JSON.stringify(result)
    expect(serialized).toContain('deepseek-v4-flash')
    expect(serialized).toContain('deepseek-chat')
    expect(serialized).toContain('deprecated compatibility alias')
    expect(serialized).toContain('deepseek_models_api')
    expect(serialized).not.toContain('sk-deepseek-secret')
    expect(serialized).not.toContain('Authorization')
    expect(serialized).not.toContain('Bearer')
  })
})

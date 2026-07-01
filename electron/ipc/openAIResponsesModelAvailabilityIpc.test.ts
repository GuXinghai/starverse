import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const electronMock = vi.hoisted(() => ({
  sessionFetch: vi.fn(),
}))

vi.mock('electron', () => ({
  session: {
    defaultSession: {
      fetch: electronMock.sessionFetch,
    },
  },
}))

import {
  OPENAI_RESPONSES_MODEL_AVAILABILITY_IPC_CHANNELS,
  registerOpenAIResponsesModelAvailabilityIpc,
} from './openAIResponsesModelAvailabilityIpc'
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
      ? { ok: true, providerKey: 'openai_responses', apiKey, source: 'secure_store', backend: 'electron_safe_storage', migratedFromLegacy: false, warnings: [] }
      : { ok: false, providerKey: 'openai_responses', code: 'credential_missing', message: 'missing', source: 'missing', backend: 'electron_safe_storage', warnings: [] }),
  } as unknown as ProviderCredentialService
}

function registerHandler(input: Readonly<{ apiKey?: string; fetchImpl?: typeof fetch; useDefaultFetch?: boolean }>) {
  const registerInvoke = vi.fn()
  registerOpenAIResponsesModelAvailabilityIpc({
    registerInvoke,
    credentialService: createCredentialService(input.apiKey),
    ...(input.useDefaultFetch ? {} : { fetchImpl: input.fetchImpl ?? vi.fn() as unknown as typeof fetch }),
  })
  const handler = registerInvoke.mock.calls.find(([channel]) => channel === 'openai-responses-models:list-availability')?.[1]
  expect(handler).toBeTypeOf('function')
  return { registerInvoke, handler: handler as (...args: unknown[]) => Promise<unknown> }
}

describe('openAIResponsesModelAvailabilityIpc', () => {
  beforeEach(() => {
    electronMock.sessionFetch.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('registers only the OpenAI Responses model availability channel', () => {
    const { registerInvoke } = registerHandler({})

    expect(registerInvoke.mock.calls.map(([channel]) => channel)).toEqual([
      ...OPENAI_RESPONSES_MODEL_AVAILABILITY_IPC_CHANNELS,
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
      message: 'OpenAI Responses model availability payload must not include credentials.',
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
      providerKey: 'openai_responses',
      endpointId: 'openai-responses-official',
      profileId: 'openai_responses_v1',
      code: 'credential_missing',
      message: 'OpenAI Responses API key is not configured.',
    })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('uses Electron session fetch by default instead of global fetch', async () => {
    const globalFetch = vi.fn(async () => {
      throw new Error('global fetch should not be used')
    }) as unknown as typeof fetch
    vi.stubGlobal('fetch', globalFetch)
    electronMock.sessionFetch.mockResolvedValueOnce(jsonResponse({
      object: 'list',
      data: [
        { id: 'gpt-4.1-mini', object: 'model', created: 1745875200, owned_by: 'system' },
      ],
    }))
    const { handler } = registerHandler({ apiKey: 'sk-openai-secret', useDefaultFetch: true })

    const result = await handler({}, { timeoutMs: 1000 })

    expect(result).toMatchObject({ ok: true, providerKey: 'openai_responses' })
    expect(electronMock.sessionFetch).toHaveBeenCalledTimes(1)
    expect(electronMock.sessionFetch.mock.calls[0]?.[0]).toBe('https://api.openai.com/v1/models')
    expect(electronMock.sessionFetch.mock.calls[0]?.[1]).toMatchObject({
      method: 'GET',
      redirect: 'error',
    })
    expect(globalFetch).not.toHaveBeenCalled()
  })

  it('redacts provider HTTP errors before returning them to renderer', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({
      error: {
        message: 'Authorization: Bearer sk-openai-secret failed',
        code: 'sk-openai-secret',
      },
    }, 401)) as unknown as typeof fetch
    const { handler } = registerHandler({ apiKey: 'sk-openai-secret', fetchImpl })

    const result = await handler({}, { timeoutMs: 1000 })

    expect(result).toMatchObject({
      ok: false,
      code: 'http_error',
      httpStatus: 401,
      message: 'OpenAI Responses model source credential was rejected.',
    })
    const serialized = JSON.stringify(result)
    expect(serialized).not.toContain('sk-openai-secret')
    expect(serialized).not.toContain('Authorization')
    expect(serialized).not.toContain('Bearer')
  })

  it('returns a safe network error when the model source request rejects', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('ECONNRESET Authorization: Bearer sk-openai-secret')
    }) as unknown as typeof fetch
    const { handler } = registerHandler({ apiKey: 'sk-openai-secret', fetchImpl })

    const result = await handler({}, { timeoutMs: 1000 })

    expect(result).toMatchObject({
      ok: false,
      code: 'network_error',
      message: 'OpenAI Responses model source request failed safely.',
    })
    const serialized = JSON.stringify(result)
    expect(serialized).not.toContain('sk-openai-secret')
    expect(serialized).not.toContain('Authorization')
    expect(serialized).not.toContain('Bearer')
  })

  it('returns a safe network error when the model source request times out', async () => {
    vi.useFakeTimers()
    const fetchImpl = vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        reject(new DOMException('The operation was aborted.', 'AbortError'))
      }, { once: true })
    })) as unknown as typeof fetch
    const { handler } = registerHandler({ apiKey: 'sk-openai-secret', fetchImpl })

    const resultPromise = handler({}, { timeoutMs: 1000 })
    await vi.advanceTimersByTimeAsync(1000)
    const result = await resultPromise

    expect(result).toMatchObject({
      ok: false,
      code: 'network_error',
      message: 'OpenAI Responses model source request failed safely.',
    })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('fetches /models with a main-process bearer credential and returns safe availability records', async () => {
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe('https://api.openai.com/v1/models')
      expect(init?.method).toBe('GET')
      expect(init?.redirect).toBe('error')
      expect((init?.headers as Record<string, string>)?.Authorization).toBe('Bearer sk-openai-secret')
      return jsonResponse({
        object: 'list',
        data: [
          { id: 'gpt-4.1-mini', object: 'model', created: 1745875200, owned_by: 'system' },
        ],
      })
    }) as unknown as typeof fetch
    const { handler } = registerHandler({ apiKey: 'sk-openai-secret', fetchImpl })

    const result = await handler({}, { timeoutMs: 1000 })

    expect(result).toMatchObject({
      ok: true,
      providerKey: 'openai_responses',
      endpointId: 'openai-responses-official',
      profileId: 'openai_responses_v1',
    })
    const serialized = JSON.stringify(result)
    expect(serialized).toContain('gpt-4.1-mini')
    expect(serialized).toContain('openai_models_api')
    expect(serialized).toContain('provider_reported')
    expect(serialized).toContain('openai_list_models_api_docs')
    expect(serialized).not.toContain('sk-openai-secret')
    expect(serialized).not.toContain('Authorization')
    expect(serialized).not.toContain('Bearer')
  })
})

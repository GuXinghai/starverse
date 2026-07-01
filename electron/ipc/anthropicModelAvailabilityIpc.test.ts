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
  ANTHROPIC_MODEL_AVAILABILITY_IPC_CHANNELS,
  registerAnthropicModelAvailabilityIpc,
} from './anthropicModelAvailabilityIpc'
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
      ? { ok: true, providerKey: 'anthropic', apiKey, source: 'secure_store', backend: 'electron_safe_storage', migratedFromLegacy: false, warnings: [] }
      : { ok: false, providerKey: 'anthropic', code: 'credential_missing', message: 'missing', source: 'missing', backend: 'electron_safe_storage', warnings: [] }),
  } as unknown as ProviderCredentialService
}

function registerHandler(input: Readonly<{ apiKey?: string; fetchImpl?: typeof fetch; useDefaultFetch?: boolean }>) {
  const registerInvoke = vi.fn()
  registerAnthropicModelAvailabilityIpc({
    registerInvoke,
    credentialService: createCredentialService(input.apiKey),
    ...(input.useDefaultFetch ? {} : { fetchImpl: input.fetchImpl ?? vi.fn() as unknown as typeof fetch }),
  })
  const handler = registerInvoke.mock.calls.find(([channel]) => channel === 'anthropic-models:list-availability')?.[1]
  expect(handler).toBeTypeOf('function')
  return { registerInvoke, handler: handler as (...args: unknown[]) => Promise<unknown> }
}

describe('anthropicModelAvailabilityIpc', () => {
  beforeEach(() => {
    electronMock.sessionFetch.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('registers only the Anthropic model availability channel', () => {
    const { registerInvoke } = registerHandler({})

    expect(registerInvoke.mock.calls.map(([channel]) => channel)).toEqual([
      ...ANTHROPIC_MODEL_AVAILABILITY_IPC_CHANNELS,
    ])
  })

  it('rejects renderer payloads that try to pass an API key or headers', async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch
    const { handler } = registerHandler({ apiKey: 'sk-ant-main-secret', fetchImpl })

    const result = await handler({}, {
      'x-api-key': 'sk-ant-renderer-secret',
      headers: { Authorization: 'Bearer sk-ant-renderer-secret' },
      timeoutMs: 1000,
    })

    expect(result).toMatchObject({
      ok: false,
      code: 'invalid_payload',
      message: 'Anthropic model availability payload must not include credentials.',
    })
    expect(fetchImpl).not.toHaveBeenCalled()
    expect(JSON.stringify(result)).not.toContain('sk-ant-renderer-secret')
    expect(JSON.stringify(result)).not.toContain('sk-ant-main-secret')
  })

  it('fails before fetch when the main-process credential is missing', async () => {
    const fetchImpl = vi.fn() as unknown as typeof fetch
    const { handler } = registerHandler({ fetchImpl })

    const result = await handler({}, { timeoutMs: 1000 })

    expect(result).toMatchObject({
      ok: false,
      providerKey: 'anthropic_messages',
      endpointId: 'anthropic-official',
      profileId: 'anthropic_messages_v1',
      code: 'credential_missing',
      message: 'Anthropic API key is not configured.',
    })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it('uses Electron session fetch by default instead of global fetch', async () => {
    const globalFetch = vi.fn(async () => {
      throw new Error('global fetch should not be used')
    }) as unknown as typeof fetch
    vi.stubGlobal('fetch', globalFetch)
    electronMock.sessionFetch.mockResolvedValueOnce(jsonResponse({
      data: [
        { id: 'claude-sonnet-4-5', type: 'model', display_name: 'Claude Sonnet 4.5' },
      ],
      has_more: false,
    }))
    const { handler } = registerHandler({ apiKey: 'sk-ant-secret', useDefaultFetch: true })

    const result = await handler({}, { timeoutMs: 1000 })

    expect(result).toMatchObject({ ok: true, providerKey: 'anthropic_messages' })
    expect(electronMock.sessionFetch).toHaveBeenCalledTimes(1)
    expect(electronMock.sessionFetch.mock.calls[0]?.[0]).toBe('https://api.anthropic.com/v1/models?limit=100')
    expect(electronMock.sessionFetch.mock.calls[0]?.[1]).toMatchObject({
      method: 'GET',
      redirect: 'error',
    })
    expect(globalFetch).not.toHaveBeenCalled()
  })

  it('redacts provider HTTP errors before returning them to renderer', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({
      error: {
        message: 'x-api-key sk-ant-secret failed',
        code: 'sk-ant-secret',
      },
    }, 401)) as unknown as typeof fetch
    const { handler } = registerHandler({ apiKey: 'sk-ant-secret', fetchImpl })

    const result = await handler({}, { timeoutMs: 1000 })

    expect(result).toMatchObject({
      ok: false,
      code: 'http_error',
      httpStatus: 401,
      message: 'Anthropic model source credential was rejected.',
    })
    const serialized = JSON.stringify(result)
    expect(serialized).not.toContain('sk-ant-secret')
    expect(serialized).not.toContain('x-api-key')
    expect(serialized).not.toContain('Bearer')
  })

  it('returns a safe network error when the model source request rejects', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('ECONNRESET x-api-key sk-ant-secret')
    }) as unknown as typeof fetch
    const { handler } = registerHandler({ apiKey: 'sk-ant-secret', fetchImpl })

    const result = await handler({}, { timeoutMs: 1000 })

    expect(result).toMatchObject({
      ok: false,
      code: 'network_error',
      message: 'Anthropic model source request failed safely.',
    })
    const serialized = JSON.stringify(result)
    expect(serialized).not.toContain('sk-ant-secret')
    expect(serialized).not.toContain('x-api-key')
    expect(serialized).not.toContain('Bearer')
  })

  it('returns a safe network error when the model source request times out', async () => {
    vi.useFakeTimers()
    const fetchImpl = vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        reject(new DOMException('The operation was aborted.', 'AbortError'))
      }, { once: true })
    })) as unknown as typeof fetch
    const { handler } = registerHandler({ apiKey: 'sk-ant-secret', fetchImpl })

    const resultPromise = handler({}, { timeoutMs: 1000 })
    await vi.advanceTimersByTimeAsync(1000)
    const result = await resultPromise

    expect(result).toMatchObject({
      ok: false,
      code: 'network_error',
      message: 'Anthropic model source request failed safely.',
    })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('fetches /models with a main-process Anthropic credential and returns safe availability records', async () => {
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe('https://api.anthropic.com/v1/models?limit=100')
      expect(init?.method).toBe('GET')
      expect(init?.redirect).toBe('error')
      expect((init?.headers as Record<string, string>)?.['x-api-key']).toBe('sk-ant-secret')
      expect((init?.headers as Record<string, string>)?.['anthropic-version']).toBe('2023-06-01')
      return jsonResponse({
        data: [
          { id: 'claude-sonnet-4-5', type: 'model', display_name: 'Claude Sonnet 4.5' },
        ],
        has_more: false,
      })
    }) as unknown as typeof fetch
    const { handler } = registerHandler({ apiKey: 'sk-ant-secret', fetchImpl })

    const result = await handler({}, { timeoutMs: 1000 })

    expect(result).toMatchObject({
      ok: true,
      providerKey: 'anthropic_messages',
      endpointId: 'anthropic-official',
      profileId: 'anthropic_messages_v1',
    })
    const serialized = JSON.stringify(result)
    expect(serialized).toContain('claude-sonnet-4-5')
    expect(serialized).toContain('anthropic_models_api')
    expect(serialized).toContain('provider_reported')
    expect(serialized).toContain('anthropic_list_models_api_docs')
    expect(serialized).not.toContain('sk-ant-secret')
    expect(serialized).not.toContain('x-api-key')
    expect(serialized).not.toContain('Bearer')
  })
})

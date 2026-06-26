import { describe, expect, it, vi } from 'vitest'
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

function registerHandler(input: Readonly<{ apiKey?: string; fetchImpl?: typeof fetch }>) {
  const registerInvoke = vi.fn()
  registerOpenAIResponsesModelAvailabilityIpc({
    registerInvoke,
    credentialService: createCredentialService(input.apiKey),
    fetchImpl: input.fetchImpl ?? vi.fn() as unknown as typeof fetch,
  })
  const handler = registerInvoke.mock.calls.find(([channel]) => channel === 'openai-responses-models:list-availability')?.[1]
  expect(handler).toBeTypeOf('function')
  return { registerInvoke, handler: handler as (...args: unknown[]) => Promise<unknown> }
}

describe('openAIResponsesModelAvailabilityIpc', () => {
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

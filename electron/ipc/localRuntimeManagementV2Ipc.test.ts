import { describe, expect, it, vi } from 'vitest'
import {
  registerLMStudioRuntimeManagementV2Ipc,
} from './lmStudioLocalProviderIpc'
import {
  registerOllamaRuntimeManagementV2Ipc,
} from './ollamaLocalProviderIpc'

type Handler = (_event: unknown, payload: unknown) => unknown

function registry() {
  const handlers = new Map<string, Handler>()
  return {
    handlers,
    registerInvoke: (channel: string, handler: Handler) => {
      if (handlers.has(channel)) throw new Error(`duplicate channel: ${channel}`)
      handlers.set(channel, handler)
    },
  }
}

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

describe('Generation V2 local-runtime management IPC', () => {
  it('registers LM Studio management only under the V2 namespace', async () => {
    const calls: Array<Readonly<{ url: string; method: string; body: string }>> = []
    const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input)
      const method = String(init?.method ?? 'GET')
      calls.push({ url, method, body: String(init?.body ?? '') })
      if (url.endsWith('/api/v1/models')) return json({ models: [] })
      if (url.endsWith('/v1/models')) return json({ data: [] })
      if (url.endsWith('/api/v1/models/load')) return json({ instance_id: 'instance:1', status: 'loaded', type: 'llm' })
      if (url.endsWith('/api/v1/models/unload')) return json({ instance_id: 'instance:1' })
      return json({}, 404)
    }) as unknown as typeof fetch
    const ipc = registry()
    const channels = registerLMStudioRuntimeManagementV2Ipc({ registerInvoke: ipc.registerInvoke, fetchImpl })

    expect(channels).toEqual([
      'generation-v2:local-runtime:lmstudio:probe',
      'generation-v2:local-runtime:lmstudio:load-model',
      'generation-v2:local-runtime:lmstudio:unload-model',
    ])
    await ipc.handlers.get(channels[0])?.({}, { endpointUrl: 'http://127.0.0.1:1234' })
    await ipc.handlers.get(channels[1])?.({}, { endpointUrl: 'http://127.0.0.1:1234', model: 'model:1' })
    await ipc.handlers.get(channels[2])?.({}, { endpointUrl: 'http://127.0.0.1:1234', instanceId: 'instance:1' })

    expect(calls.map((call) => new URL(call.url).pathname)).toEqual([
      '/api/v1/models', '/v1/models', '/api/v1/models/load', '/api/v1/models/unload',
    ])
    expect(JSON.stringify(calls)).not.toContain('/api/v1/chat')
    expect(JSON.stringify(calls)).not.toContain('/v1/chat/completions')
  })

  it('registers Ollama management only and uses empty native chat exclusively for load state', async () => {
    const calls: Array<Readonly<{ url: string; method: string; body: string }>> = []
    const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input)
      const method = String(init?.method ?? 'GET')
      const body = String(init?.body ?? '')
      calls.push({ url, method, body })
      if (url.endsWith('/api/tags') || url.endsWith('/api/ps')) return json({ models: [] })
      if (url.endsWith('/api/version')) return json({ version: '0.9.0' })
      if (url.endsWith('/v1/models')) return json({ data: [] })
      if (url.endsWith('/api/chat')) return json({ done: true })
      return json({}, 404)
    }) as unknown as typeof fetch
    const ipc = registry()
    const channels = registerOllamaRuntimeManagementV2Ipc({ registerInvoke: ipc.registerInvoke, fetchImpl })

    expect(channels).toEqual([
      'generation-v2:local-runtime:ollama:probe',
      'generation-v2:local-runtime:ollama:load-model',
      'generation-v2:local-runtime:ollama:unload-model',
    ])
    await ipc.handlers.get(channels[0])?.({}, { endpointUrl: 'http://127.0.0.1:11434' })
    await ipc.handlers.get(channels[1])?.({}, { endpointUrl: 'http://127.0.0.1:11434', model: 'model:1' })
    await ipc.handlers.get(channels[2])?.({}, { endpointUrl: 'http://127.0.0.1:11434', model: 'model:1' })

    const controls = calls.filter((call) => new URL(call.url).pathname === '/api/chat')
    expect(controls).toHaveLength(2)
    expect(JSON.parse(controls[0]!.body)).toEqual({ model: 'model:1', messages: [], stream: false })
    expect(JSON.parse(controls[1]!.body)).toEqual({ model: 'model:1', messages: [], stream: false, keep_alive: 0 })
  })
})

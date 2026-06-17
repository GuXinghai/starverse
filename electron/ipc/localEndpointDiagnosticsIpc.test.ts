import { describe, expect, it, vi } from 'vitest'
import {
  parseOllamaModelsResponse,
  parseOpenAiModelsResponse,
  probeLocalEndpointDiagnostics,
  probeLocalEndpointStreamDiagnostics,
  registerLocalEndpointDiagnosticsIpc,
  validateLocalEndpointProbeUrl,
} from './localEndpointDiagnosticsIpc'

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

describe('localEndpointDiagnosticsIpc', () => {
  it('accepts loopback URLs and rejects public or credential-bearing URLs', () => {
    expect(validateLocalEndpointProbeUrl('http://localhost:1234').ok).toBe(true)
    expect(validateLocalEndpointProbeUrl('http://127.0.0.1:11434').ok).toBe(true)
    expect(validateLocalEndpointProbeUrl('http://[::ffff:127.0.0.1]:1234').ok).toBe(true)
    expect(validateLocalEndpointProbeUrl('http://[::1]:8080/v1').ok).toBe(true)

    expect(validateLocalEndpointProbeUrl('https://api.example.com/v1')).toMatchObject({
      ok: false,
      code: 'remote_host_rejected',
    })
    expect(validateLocalEndpointProbeUrl('http://user:pass@localhost:1234/v1?token=secret')).toMatchObject({
      ok: false,
      code: 'embedded_credentials_rejected',
      safeUrl: 'http://localhost:1234/v1',
    })
    expect(JSON.stringify(validateLocalEndpointProbeUrl('http://user:pass@localhost:1234/v1?token=secret')))
      .not.toContain('user:pass')
  })

  it('parses OpenAI-compatible and Ollama model list responses conservatively', () => {
    expect(parseOpenAiModelsResponse({
      data: [{ id: 'gpt-oss-20b' }, { id: 'local-model' }, { id: '' }],
    })).toEqual({
      ok: true,
      source: 'openai_v1_models',
      models: ['gpt-oss-20b', 'local-model'],
      truncated: false,
    })

    expect(parseOllamaModelsResponse({
      models: [{ name: 'llama3.2:latest' }, { name: 'qwen2.5:7b' }],
    })).toEqual({
      ok: true,
      source: 'ollama_api_tags',
      models: ['llama3.2:latest', 'qwen2.5:7b'],
      truncated: false,
    })

    expect(parseOpenAiModelsResponse({ object: 'list' })).toMatchObject({
      ok: false,
      code: 'invalid_response',
    })
  })

  it('probes OpenAI-compatible /v1/models without sending secrets or enabling chat', async () => {
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe('http://localhost:1234/v1/models')
      expect(init?.headers).toEqual({ Accept: 'application/json' })
      expect(init?.redirect).toBe('error')
      expect(JSON.stringify(init)).not.toContain('Authorization')
      expect(JSON.stringify(init)).not.toContain('Bearer')
      return jsonResponse({ data: [{ id: 'local-openai-model' }] })
    }) as unknown as typeof fetch

    const result = await probeLocalEndpointDiagnostics({
      url: 'http://localhost:1234/v1?token=sk-hidden',
      timeoutMs: 750,
    }, { fetchImpl })

    expect(result).toEqual({
      ok: true,
      diagnostics: {
        kind: 'local_endpoint_diagnostics',
        status: 'reachable',
        endpointFamily: 'openai_compatible',
        safeBaseUrl: 'http://localhost:1234/v1',
        modelList: {
          ok: true,
          source: 'openai_v1_models',
          models: ['local-openai-model'],
          truncated: false,
        },
        capabilitySummary: {
          chatSendAvailable: false,
          textChat: 'diagnostics_only',
          streaming: 'not_probed',
          tools: false,
          files: false,
          reasoning: false,
          webSearch: false,
        },
        message: 'Local endpoint is reachable through OpenAI-compatible model listing.',
      },
    })
    expect(JSON.stringify(result)).not.toContain('sk-hidden')
  })

  it('does not follow loopback redirects to public URLs during model-list probe', async () => {
    const fetchImpl = vi.fn(async (_url: string, init?: RequestInit) => {
      expect(init?.redirect).toBe('error')
      return new Response(null, {
        status: 302,
        headers: { location: 'https://public.example.test/v1/models?token=sk-redirect' },
      })
    }) as unknown as typeof fetch

    const result = await probeLocalEndpointDiagnostics({
      url: 'http://localhost:1234/v1',
      timeoutMs: 750,
    }, { fetchImpl })

    expect(result).toMatchObject({
      ok: true,
      diagnostics: {
        status: 'unreachable',
        endpointFamily: 'unknown',
        modelList: { ok: false, code: 'network_error' },
      },
    })
    expect(fetchImpl).toHaveBeenCalledTimes(2)
    expect(JSON.stringify(result)).not.toContain('public.example.test')
    expect(JSON.stringify(result)).not.toContain('sk-redirect')
  })

  it('falls back to Ollama /api/tags when OpenAI-compatible model listing is unavailable', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      if (url.endsWith('/v1/models')) return jsonResponse({ error: 'not found' }, 404)
      expect(url).toBe('http://localhost:11434/api/tags')
      return jsonResponse({ models: [{ name: 'llama3.2:latest' }] })
    }) as unknown as typeof fetch

    const result = await probeLocalEndpointDiagnostics({
      url: 'http://localhost:11434',
      timeoutMs: 750,
    }, { fetchImpl })

    expect(result).toMatchObject({
      ok: true,
      diagnostics: {
        status: 'reachable',
        endpointFamily: 'ollama',
        modelList: {
          ok: true,
          source: 'ollama_api_tags',
          models: ['llama3.2:latest'],
        },
      },
    })
  })

  it('normalizes probe failures without leaking raw error details', async () => {
    const rawSecret = 'Bearer sk-local-admin-secret Authorization customHeader user:pass'
    const fetchImpl = vi.fn(async () => {
      throw new Error(rawSecret)
    }) as unknown as typeof fetch

    const result = await probeLocalEndpointDiagnostics({
      url: 'http://localhost:1234/v1',
      timeoutMs: 750,
    }, { fetchImpl })

    expect(result).toMatchObject({
      ok: true,
      diagnostics: {
        status: 'unreachable',
        endpointFamily: 'unknown',
        modelList: {
          ok: false,
          code: 'network_error',
        },
      },
    })
    const serialized = JSON.stringify(result)
    expect(serialized).not.toContain('sk-local-admin-secret')
    expect(serialized).not.toContain('Bearer')
    expect(serialized).not.toContain('Authorization')
    expect(serialized).not.toContain('customHeader')
    expect(serialized).not.toContain('user:pass')
  })

  it('runs OpenAI-compatible stream probe with redirect blocking and text-delta evidence', async () => {
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      expect(init?.redirect).toBe('error')
      expect(JSON.stringify(init)).not.toContain('Authorization')
      expect(JSON.stringify(init)).not.toContain('Bearer')
      if (url.endsWith('/v1/models')) return jsonResponse({ data: [{ id: 'local-openai-model' }] })
      expect(url).toBe('http://localhost:1234/v1/chat/completions')
      expect(init?.method).toBe('POST')
      expect(init?.body).toContain('"stream":true')
      return new Response('data: {"choices":[{"delta":{"content":"pong"}}]}\n\ndata: [DONE]\n\n', {
        status: 200,
        headers: { 'content-type': 'text/event-stream' },
      })
    }) as unknown as typeof fetch

    const result = await probeLocalEndpointStreamDiagnostics({
      url: 'http://localhost:1234/v1?token=sk-hidden',
      timeoutMs: 750,
    }, { fetchImpl })

    expect(result).toEqual({
      ok: true,
      diagnostics: {
        kind: 'local_endpoint_stream_diagnostics',
        status: 'supported',
        endpointFamily: 'openai_compatible',
        safeBaseUrl: 'http://localhost:1234/v1',
        textDeltaPreview: 'pong',
        evidence: 'text_delta_observed',
        capabilitySummary: {
          chatSendAvailable: false,
          streaming: 'diagnostics_only_supported',
          tools: false,
          files: false,
          reasoning: false,
          webSearch: false,
        },
        message: 'Local endpoint produced text delta evidence in diagnostics-only stream probe.',
      },
    })
    expect(JSON.stringify(result)).not.toContain('sk-hidden')
  })

  it('runs Ollama stream probe when OpenAI-compatible model listing is unavailable', async () => {
    const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => {
      expect(init?.redirect).toBe('error')
      if (url.endsWith('/v1/models')) return jsonResponse({ error: 'not found' }, 404)
      if (url.endsWith('/api/tags')) return jsonResponse({ models: [{ name: 'llama3.2:latest' }] })
      expect(url).toBe('http://localhost:11434/api/chat')
      expect(init?.method).toBe('POST')
      expect(init?.body).toContain('"stream":true')
      return new Response('{"message":{"content":"pon"}}\n{"message":{"content":"g"}}\n', {
        status: 200,
        headers: { 'content-type': 'application/x-ndjson' },
      })
    }) as unknown as typeof fetch

    const result = await probeLocalEndpointStreamDiagnostics({
      url: 'http://localhost:11434',
      timeoutMs: 750,
    }, { fetchImpl })

    expect(result).toMatchObject({
      ok: true,
      diagnostics: {
        status: 'supported',
        endpointFamily: 'ollama',
        textDeltaPreview: 'pong',
        evidence: 'text_delta_observed',
      },
    })
  })

  it('fails stream probe safely when no model is available', async () => {
    const rawSecret = 'Bearer sk-local-admin-secret Authorization'
    const fetchImpl = vi.fn(async () => {
      throw new Error(rawSecret)
    }) as unknown as typeof fetch

    const result = await probeLocalEndpointStreamDiagnostics({
      url: 'http://localhost:1234/v1',
      timeoutMs: 750,
    }, { fetchImpl })

    expect(result).toMatchObject({
      ok: true,
      diagnostics: {
        status: 'failed',
        endpointFamily: 'unknown',
        evidence: 'model_unavailable',
        capabilitySummary: { chatSendAvailable: false },
      },
    })
    const serialized = JSON.stringify(result)
    expect(serialized).not.toContain('sk-local-admin-secret')
    expect(serialized).not.toContain('Bearer')
    expect(serialized).not.toContain('Authorization')
  })

  it('registers only the manual diagnostics probe channel', async () => {
    const registerInvoke = vi.fn()
    registerLocalEndpointDiagnosticsIpc({ registerInvoke, fetchImpl: vi.fn() as unknown as typeof fetch })

    expect(registerInvoke.mock.calls.map(([channel]) => channel)).toEqual([
      'local-endpoint-diagnostics:probe',
      'local-endpoint-diagnostics:stream-probe',
    ])
  })
})

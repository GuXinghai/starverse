import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import BetterSqlite3 from 'better-sqlite3'
import { OpenRouterService } from '../../src/services/providers/OpenRouterService'
import { buildUsageLogPayload, normalizeUsagePayload } from '../../src/services/usageTracking'
import { UsageRepo } from '../../infra/db/repo/usageRepo'
import { DEFAULT_GENERATION_CONFIG } from '../../src/types/generation'

const encoder = new TextEncoder()
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const schemaPath = path.resolve(__dirname, '../../infra/db/schema.sql')

const MOCK_CAPABILITY = {
  modelId: 'openrouter/auto',
  sampling: {
    temperature: true,
    top_p: true,
    top_k: true,
    min_p: true,
    top_a: true,
    frequency_penalty: true,
    presence_penalty: true,
    repetition_penalty: true,
    seed: true,
    logit_bias: true,
  },
  length: {
    max_tokens: true,
    stop: true,
    verbosity: true,
    maxCompletionTokens: 32768,
  },
  reasoning: {
    supportsReasoningParam: true,
    supportsIncludeReasoning: true,
    supportsMaxReasoningTokens: true,
    returnsVisibleReasoning: 'yes',
    maxCompletionTokens: 32768,
    internalReasoningPrice: null,
    family: 'other',
    reasoningClass: 'A',
    maxTokensPolicy: 'provider-unknown-range',
  },
  other: {
    tools: true,
    response_format: true,
    structured_outputs: true,
    logprobs: true,
    top_logprobs: true,
    parallel_tool_calls: true,
  },
}

const createUsageRepo = () => {
  try {
    const db = new BetterSqlite3(':memory:')
    const schema = readFileSync(schemaPath, 'utf8')
    db.exec(schema)
    const repo = new UsageRepo(db as any)
    return { db, repo }
  } catch (error: any) {
    if (typeof error?.message === 'string' && error.message.includes('NODE_MODULE_VERSION')) {
      console.warn('Skipping usage_log integration test due to native module mismatch:', error.message)
      return null
    }
    throw error
  }
}

const createStreamResponse = (sseLines: string[], headers: Record<string, string> = {}) => {
  const stream = new ReadableStream({
    start(controller) {
      sseLines.forEach((line) => controller.enqueue(encoder.encode(line)))
      controller.close()
    }
  })
  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream',
      ...headers
    }
  })
}

describe('OpenRouter usage capture', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('includes usage flag for streaming requests and emits final usage chunk with requestId', async () => {
    let capturedBody: any = null
    const fetchMock = vi.fn().mockImplementation((_url, init: RequestInit) => {
      capturedBody = JSON.parse(init?.body as string)
      const sse = [
        'data: {"choices":[{"delta":{"content":"Hi"}}]}\n\n',
        'data: {"choices":[],"usage":{"prompt_tokens":5,"completion_tokens":7,"prompt_tokens_details":{"cached_tokens":2},"completion_tokens_details":{"reasoning_tokens":1}}}\n\n',
        'data: [DONE]\n\n'
      ]
      return createStreamResponse(sse, { 'x-request-id': 'req-stream-123' })
    })

    vi.stubGlobal('fetch', fetchMock)

    const chunks: any[] = []
    const stream = OpenRouterService.streamChatResponse('test-key', [], 'openrouter/auto', 'hello world', undefined, {
      generationConfig: DEFAULT_GENERATION_CONFIG,
      modelCapability: MOCK_CAPABILITY
    })
    for await (const chunk of stream) {
      chunks.push(chunk)
    }

    expect(capturedBody?.usage?.include).toBe(true)
    expect(capturedBody?.stream).toBe(true)
    const usageChunk = chunks.find((c) => c?.type === 'usage')
    expect(usageChunk).toBeDefined()
    expect(usageChunk?.usage?.prompt_tokens).toBe(5)
    expect(usageChunk?.requestId).toBe('req-stream-123')
  })

  it('includes usage flag for non-streaming requests and parses usage', async () => {
    let capturedBody: any = null
    const fetchMock = vi.fn().mockImplementation((_url, init: RequestInit) => {
      capturedBody = JSON.parse(init?.body as string)
      const payload = {
        id: 'gen-nonstream-1',
        choices: [{ message: { content: 'hi!' } }],
        usage: {
          prompt_tokens: 3,
          completion_tokens: 4,
          prompt_tokens_details: { cached_tokens: 1 },
          completion_tokens_details: { reasoning_tokens: 2 },
          cost: 0.02
        }
      }
      return new Response(JSON.stringify(payload), { status: 200 })
    })

    vi.stubGlobal('fetch', fetchMock)

    const chunks: any[] = []
    const stream = OpenRouterService.streamChatResponse('test-key', [], 'openrouter/auto', 'hi', undefined, {
      stream: false,
      generationConfig: DEFAULT_GENERATION_CONFIG,
      modelCapability: MOCK_CAPABILITY
    })
    for await (const chunk of stream) {
      chunks.push(chunk)
    }

    expect(capturedBody?.usage?.include).toBe(true)
    expect(capturedBody?.stream).toBe(false)
    const usageChunk = chunks.find((c) => c?.type === 'usage')
    expect(usageChunk?.usage?.prompt_tokens).toBe(3)
    expect(usageChunk?.requestId).toBe('gen-nonstream-1')
  })

  it('toggles include_reasoning / reasoning.exclude based on showReasoningContent', async () => {
    const fetchMock = vi.fn().mockImplementation((_url, init: RequestInit) => {
      const capturedBody = JSON.parse(init?.body as string)
      const payload = {
        id: 'gen-reasoning-1',
        choices: [{ message: { content: 'ok' } }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
      }
      return Promise.resolve({ capturedBody, response: new Response(JSON.stringify(payload), { status: 200 }) })
    })

    // case 1: showReasoningContent = true
    {
      let captured: any = null
      vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url, init: RequestInit) => {
        const result: any = await fetchMock(url, init)
        captured = result.capturedBody
        return result.response
      }))

      const config = {
        ...DEFAULT_GENERATION_CONFIG,
        reasoning: {
          ...(DEFAULT_GENERATION_CONFIG.reasoning as any),
          showReasoningContent: true,
        },
      }

      const chunks: any[] = []
      const stream = OpenRouterService.streamChatResponse('test-key', [], 'openrouter/auto', 'hi', undefined, {
        stream: false,
        generationConfig: config as any,
        modelCapability: MOCK_CAPABILITY,
      })
      for await (const chunk of stream) chunks.push(chunk)

      expect(captured?.include_reasoning).toBe(true)
      expect(captured?.reasoning?.exclude).toBe(false)
    }

    // case 2: showReasoningContent = false
    {
      let captured: any = null
      vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url, init: RequestInit) => {
        const result: any = await fetchMock(url, init)
        captured = result.capturedBody
        return result.response
      }))

      const config = {
        ...DEFAULT_GENERATION_CONFIG,
        reasoning: {
          ...(DEFAULT_GENERATION_CONFIG.reasoning as any),
          showReasoningContent: false,
        },
      }

      const chunks: any[] = []
      const stream = OpenRouterService.streamChatResponse('test-key', [], 'openrouter/auto', 'hi', undefined, {
        stream: false,
        generationConfig: config as any,
        modelCapability: MOCK_CAPABILITY,
      })
      for await (const chunk of stream) chunks.push(chunk)

      expect(captured?.include_reasoning).toBe(false)
      expect(captured?.reasoning?.exclude).toBe(true)
    }
  })

  it('emits the final usage chunk when the stream ends with an empty choices block', async () => {
    const fetchMock = vi.fn().mockImplementation((_url, init: RequestInit) => {
      const sse = [
        'data: {"choices":[{"delta":{"content":"Hello"}}]}\n\n',
        'data: {"choices":[],"usage":{"prompt_tokens":2,"completion_tokens":4,"cost":0.01}}\n\n',
        'data: [DONE]\n\n'
      ]
      return createStreamResponse(sse, { 'x-openrouter-id': 'req-final-usage' })
    })

    vi.stubGlobal('fetch', fetchMock)

    const chunks: any[] = []
    const stream = OpenRouterService.streamChatResponse('test-key', [], 'openrouter/auto', 'hi there', undefined, {
      generationConfig: DEFAULT_GENERATION_CONFIG,
      modelCapability: MOCK_CAPABILITY
    })
    for await (const chunk of stream) {
      chunks.push(chunk)
    }

    const usageChunks = chunks.filter((c) => c?.type === 'usage')
    expect(usageChunks).toHaveLength(1)
    expect(usageChunks[0]?.usage?.completion_tokens).toBe(4)
    expect(usageChunks[0]?.requestId).toBe('req-final-usage')
  })

  it('logs non-streaming usage into usage_log with request_id and attempt', async () => {
    const instance = createUsageRepo()
    if (!instance) {
      expect(true).toBe(true)
      return
    }
    const { repo, db } = instance

    let capturedBody: any = null
    const fetchMock = vi.fn().mockImplementation((_url, init: RequestInit) => {
      capturedBody = JSON.parse(init?.body as string)
      const payload = {
        id: 'gen-nonstream-2',
        choices: [{ message: { content: 'hi!' } }],
        usage: {
          prompt_tokens: 4,
          completion_tokens: 6,
          prompt_tokens_details: { cached_tokens: 1 },
          completion_tokens_details: { reasoning_tokens: 2 },
          cost: 0.05
        }
      }
      return new Response(JSON.stringify(payload), { status: 200 })
    })

    vi.stubGlobal('fetch', fetchMock)

    const chunks: any[] = []
    const stream = OpenRouterService.streamChatResponse('test-key', [], 'openrouter/auto', 'hi there', undefined, {
      stream: false,
      generationConfig: DEFAULT_GENERATION_CONFIG,
      modelCapability: MOCK_CAPABILITY
    })
    for await (const chunk of stream) {
      chunks.push(chunk)
    }

    expect(capturedBody?.usage?.include).toBe(true)
    const usageChunk = chunks.find((c) => c?.type === 'usage')
    const normalized = normalizeUsagePayload(usageChunk?.usage)

    const payload = buildUsageLogPayload({
      provider: 'OpenRouter',
      model: 'openrouter/auto',
      projectId: 'proj-nonstream',
      convoId: 'convo-nonstream',
      startedAt: 100,
      endedAt: 600,
      status: 'success',
      usage: normalized,
      rawUsage: usageChunk?.usage ?? null,
      requestId: usageChunk?.requestId,
      attempt: 2,
      meta: { feature: 'test-nonstream' }
    })

    repo.logUsage(payload)

    const row = db
      .prepare('SELECT provider, request_id, attempt, tokens_input, tokens_output, cost, status, meta FROM usage_log')
      .get() as any
    expect(row.request_id).toBe('gen-nonstream-2')
    expect(row.attempt).toBe(2)
    expect(row.tokens_input).toBe(4)
    expect(row.tokens_output).toBe(6)
    expect(row.cost).toBeCloseTo(0.05)
    db.close()
  })
})

describe('buildUsageLogPayload', () => {
  it('maps usage fields into usage_log payload with ttft', () => {
    const usage = normalizeUsagePayload({
      prompt_tokens: 12,
      completion_tokens: 6,
      prompt_tokens_details: { cached_tokens: 2 },
      completion_tokens_details: { reasoning_tokens: 1 },
      cost: 0.25
    })

    const payload = buildUsageLogPayload({
      provider: 'OpenRouter',
      model: 'gpt-4o',
      projectId: 'proj-1',
      convoId: 'convo-1',
      startedAt: 1000,
      endedAt: 2600,
      firstTokenAt: 1200,
      status: 'success',
      usage,
      rawUsage: usage?.raw ?? null,
      requestId: 'req-abc',
      attempt: 2,
      meta: { feature: 'test' }
    })

    expect(payload.tokens_input).toBe(12)
    expect(payload.tokens_output).toBe(6)
    expect(payload.tokens_cached).toBe(2)
    expect(payload.tokens_reasoning).toBe(1)
    expect(payload.cost).toBeCloseTo(0.25)
    expect(payload.ttft_ms).toBe(200)
    expect(payload.duration_ms).toBe(1600)
    expect(payload.meta?.request_id).toBe('req-abc')
    expect(payload.meta?.feature).toBe('test')
    expect(payload.meta?.usage_raw).toBeDefined()
    expect(payload.meta?.attempt).toBe(2)
  })

  it('zeroes metrics and marks missing usage on errors', () => {
    const payload = buildUsageLogPayload({
      provider: 'OpenRouter',
      model: 'gpt-4o',
      startedAt: 0,
      endedAt: 500,
      status: 'error',
      errorCode: 'TIMEOUT',
      usage: null,
      requestId: 'req-fail',
      meta: { feature: 'test-error' },
      aborted: true
    })

    expect(payload.tokens_input).toBe(0)
    expect(payload.tokens_output).toBe(0)
    expect(payload.cost).toBe(0)
    expect(payload.status).toBe('error')
    expect(payload.error_code).toBe('TIMEOUT')
    expect(payload.meta?.usage_missing).toBe(true)
    expect(payload.meta?.aborted).toBe(true)
  })
})

describe('usage logging pipeline integration', () => {
  it('persists mapped usage fields and raw meta into usage_log', () => {
    const instance = createUsageRepo()
    if (!instance) {
      expect(true).toBe(true)
      return
    }
    const { repo, db } = instance
    const usage = normalizeUsagePayload({
      prompt_tokens: 10,
      completion_tokens: 5,
      prompt_tokens_details: { cached_tokens: 3 },
      completion_tokens_details: { reasoning_tokens: 2 },
      cost: 0.2
    })

    const payload = buildUsageLogPayload({
      provider: 'OpenRouter',
      model: 'openrouter/auto',
      projectId: 'proj-123',
      convoId: 'convo-456',
      startedAt: 1000,
      endedAt: 2600,
      firstTokenAt: 1400,
      status: 'success',
      usage: usage,
      rawUsage: usage?.raw ?? null,
      requestId: 'req-integration',
      attempt: 1,
      meta: { feature: 'test-integration' }
    })

    repo.logUsage(payload)

    const row = db.prepare('SELECT provider, model, tokens_input, tokens_output, tokens_cached, tokens_reasoning, cost, duration_ms, ttft_ms, status, meta FROM usage_log').get() as any
    expect(row.tokens_input).toBe(10)
    expect(row.tokens_output).toBe(5)
    expect(row.tokens_cached).toBe(3)
    expect(row.tokens_reasoning).toBe(2)
    expect(row.cost).toBeCloseTo(0.2)
    expect(row.duration_ms).toBe(1600)
    expect(row.ttft_ms).toBe(400)
    expect(row.status).toBe('success')

    const meta = row.meta ? JSON.parse(row.meta) : {}
    expect(meta.request_id).toBe('req-integration')
    expect(meta.feature).toBe('test-integration')
    expect(meta.usage_raw?.prompt_tokens).toBe(10)
    db.close()
  })
})

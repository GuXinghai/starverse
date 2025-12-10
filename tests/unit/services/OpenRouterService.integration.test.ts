/**
 * OpenRouterService 集成测试
 * 
 * 测试目标：验证完整流水线（旧实现）
 * - 验证 fetch 调用
 * - 验证消息格式转换
 * - 验证 yield 输出格式
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { OpenRouterService } from '../../../src/services/providers/OpenRouterService'
import type { HistoryMessage } from '../../../src/types/providers'

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Mock Fetch 工具函数
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function createMockSSEStream(lines: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder()
  let index = 0
  
  return new ReadableStream({
    async pull(controller) {
      if (index < lines.length) {
        controller.enqueue(encoder.encode(lines[index++]))
      } else {
        controller.close()
      }
    }
  })
}

function createMockFetchResponse(sseLines: string[], status = 200): Response {
  const stream = createMockSSEStream(sseLines)
  
  return {
    ok: status >= 200 && status < 300,
    status,
    body: stream,
    text: async () => sseLines.join(''),
    json: async () => ({}),
    headers: new Headers()
  } as Response
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// 测试套件
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

describe('OpenRouterService 集成测试', () => {
  let originalFetch: typeof global.fetch

  beforeEach(() => {
    originalFetch = global.fetch
  })

  afterEach(() => {
    global.fetch = originalFetch
    vi.restoreAllMocks()
  })

  it('应正确处理纯文本流式响应', async () => {
    const sseLines = [
      'data: {"id":"gen-1","choices":[{"delta":{"content":"Hello"}}]}\n',
      '\n',
      'data: {"id":"gen-1","choices":[{"delta":{"content":" world"}}]}\n',
      '\n',
      'data: {"id":"gen-1","choices":[{"delta":{"content":"!"}}]}\n',
      '\n',
      'data: [DONE]\n',
      '\n'
    ]

    global.fetch = vi.fn().mockResolvedValue(createMockFetchResponse(sseLines))

    const history: HistoryMessage[] = []
    const chunks: any[] = []

    const stream = OpenRouterService.streamChatResponse(
      'test-api-key',
      history,
      'openai/gpt-4',
      'Test message',
      null
    )

    for await (const chunk of stream) {
      chunks.push(chunk)
    }

    // 验证输出格式（旧实现返回对象）
    expect(chunks.length).toBe(3)
    expect(chunks.every(c => c.type === 'text')).toBe(true)
    
    const textContent = chunks.map(c => c.content).join('')
    expect(textContent).toBe('Hello world!')
  })

  it('应正确处理包含推理的流式响应', async () => {
    const sseLines = [
      'data: {"id":"gen-2","choices":[{"delta":{"reasoning_details":[{"type":"analysis","text":"Step 1","id":"detail-1"}]}}]}\n',
      '\n',
      'data: {"id":"gen-2","choices":[{"delta":{"content":"The answer is 42"}}]}\n',
      '\n',
      'data: [DONE]\n',
      '\n'
    ]

    global.fetch = vi.fn().mockResolvedValue(createMockFetchResponse(sseLines))

    const history: HistoryMessage[] = []
    const chunks: any[] = []

    const stream = OpenRouterService.streamChatResponse(
      'test-api-key',
      history,
      'deepseek/deepseek-r1',
      'What is the answer?',
      null
    )

    for await (const chunk of stream) {
      chunks.push(chunk)
    }

    expect(chunks.length).toBeGreaterThan(0)
    
    const textChunks = chunks.filter(c => c.type === 'text')
    expect(textChunks.length).toBe(1)
    expect(textChunks[0].content).toBe('The answer is 42')
    
    const reasoningChunks = chunks.filter(c => c.type === 'reasoning_detail')
    expect(reasoningChunks.length).toBeGreaterThan(0)
  })

  it('应正确处理包含图片的流式响应', async () => {
    const sseLines = [
      'data: {"id":"gen-3","choices":[{"delta":{"content":"Here is an image:"}}]}\n',
      '\n',
      'data: {"id":"gen-3","choices":[{"delta":{"content":[{"type":"image_url","image_url":"https://example.com/img1.png"}]}}]}\n',
      '\n',
      'data: [DONE]\n',
      '\n'
    ]

    global.fetch = vi.fn().mockResolvedValue(createMockFetchResponse(sseLines))

    const history: HistoryMessage[] = []
    const chunks: any[] = []

    const stream = OpenRouterService.streamChatResponse(
      'test-api-key',
      history,
      'openai/gpt-4o',
      'Show me images',
      null
    )

    for await (const chunk of stream) {
      chunks.push(chunk)
    }

    expect(chunks.length).toBeGreaterThan(0)
    
    const textChunks = chunks.filter(c => c.type === 'text')
    const textContent = textChunks.map(c => c.content).join('')
    expect(textContent).toContain('Here is an image:')
    
    const imageChunks = chunks.filter(c => c.type === 'image')
    expect(imageChunks.length).toBe(1)
    expect(imageChunks[0].content).toBe('https://example.com/img1.png')
  })

  it('应正确处理包含 Usage 的流式响应', async () => {
    const sseLines = [
      'data: {"id":"gen-4","choices":[{"delta":{"content":"Response text"}}]}\n',
      '\n',
      'data: {"id":"gen-4","usage":{"prompt_tokens":10,"completion_tokens":5,"total_tokens":15}}\n',
      '\n',
      'data: [DONE]\n',
      '\n'
    ]

    global.fetch = vi.fn().mockResolvedValue(createMockFetchResponse(sseLines))

    const history: HistoryMessage[] = []
    const chunks: any[] = []

    const stream = OpenRouterService.streamChatResponse(
      'test-api-key',
      history,
      'openai/gpt-4',
      'Test message',
      null
    )

    for await (const chunk of stream) {
      chunks.push(chunk)
    }

    expect(chunks.length).toBeGreaterThan(0)
    
    const textChunks = chunks.filter(c => c.type === 'text')
    const textContent = textChunks.map(c => c.content).join('')
    expect(textContent).toBe('Response text')
    
    const usageChunks = chunks.filter(c => c.type === 'usage')
    expect(usageChunks.length).toBe(1)
    expect(usageChunks[0].usage.prompt_tokens).toBe(10)
  })

  it('应正确处理 API 错误', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => 'Unauthorized',
      body: null,
      headers: new Headers({
        'content-type': 'text/plain'
      })
    } as Response)

    const history: HistoryMessage[] = []

    const stream = OpenRouterService.streamChatResponse(
      'invalid-api-key',
      history,
      'openai/gpt-4',
      'Test message',
      null
    )

    const chunks: any[] = []
    for await (const chunk of stream) {
      chunks.push(chunk)
    }

    // 验证：应该收到一个错误类型的 chunk
    expect(chunks.length).toBe(1)
    expect(chunks[0]).toMatchObject({
      type: 'openrouter_error',
      status: 401
    })
    expect(chunks[0].error.message).toMatch(/OpenRouter|认证失败|API Key|401|Unauthorized/i)
  })

  it('应正确发送包含历史消息的请求', async () => {
    const sseLines = [
      'data: {"id":"gen-6","choices":[{"delta":{"content":"Response"}}]}\n',
      '\n',
      'data: [DONE]\n',
      '\n'
    ]

    const mockFetch = vi.fn().mockResolvedValue(createMockFetchResponse(sseLines))
    global.fetch = mockFetch

    const history: HistoryMessage[] = [
      {
        role: 'user',
        parts: [{ type: 'text', text: 'Previous question' }]
      },
      {
        role: 'model',
        parts: [{ type: 'text', text: 'Previous answer' }]
      }
    ]

    const stream = OpenRouterService.streamChatResponse(
      'test-api-key',
      history,
      'openai/gpt-4',
      'New question',
      null
    )

    const chunks: any[] = []
    for await (const chunk of stream) {
      chunks.push(chunk)
    }

    // 验证 fetch 被调用
    expect(mockFetch).toHaveBeenCalledTimes(1)

    // 验证请求体
    const fetchCall = mockFetch.mock.calls[0]
    const requestBody = JSON.parse(fetchCall[1].body)

    // 验证消息数量（2条历史 + 1条新消息 = 3条）
    expect(requestBody.messages.length).toBe(3)
    expect(requestBody.model).toBe('openai/gpt-4')
    expect(requestBody.stream).toBe(true)
  })

  it('应正确发送多模态消息（文本 + 图片）', async () => {
    const sseLines = [
      'data: {"id":"gen-8","choices":[{"delta":{"content":"I see a cat"}}]}\n',
      '\n',
      'data: [DONE]\n',
      '\n'
    ]

    const mockFetch = vi.fn().mockResolvedValue(createMockFetchResponse(sseLines))
    global.fetch = mockFetch

    const history: HistoryMessage[] = [
      {
        role: 'user',
        parts: [
          { type: 'text', text: 'What is in this image?' },
          { 
            type: 'image_url', 
            image_url: { url: 'https://example.com/cat.jpg' } 
          }
        ]
      }
    ]

    const stream = OpenRouterService.streamChatResponse(
      'test-api-key',
      history,
      'openai/gpt-4o',
      'Describe it',
      null
    )

    const chunks: any[] = []
    for await (const chunk of stream) {
      chunks.push(chunk)
    }

    // 验证请求体包含图片
    const fetchCall = mockFetch.mock.calls[0]
    const requestBody = JSON.parse(fetchCall[1].body)

    expect(requestBody.messages[0].content.length).toBe(2)
    expect(requestBody.messages[0].content[0].type).toBe('text')
    expect(requestBody.messages[0].content[1].type).toBe('image_url')
    expect(requestBody.messages[0].content[1].image_url.url).toBe('https://example.com/cat.jpg')
  })
})

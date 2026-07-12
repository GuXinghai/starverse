import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  ANTHROPIC_ASSISTANT_SNAPSHOT_KEY,
  ANTHROPIC_MESSAGES_SOURCE_API,
  ANTHROPIC_PROVIDER_NATIVE_PROVIDER_KEY,
  type AnthropicProviderNativeSnapshot,
} from '@/next/provider/anthropic/anthropicProviderNativeContent'
import {
  buildAnthropicTextChatMessages,
  streamAnthropicTextChatAsDomainEvents,
} from './anthropicTextChat'

function anthropicSnapshot(): AnthropicProviderNativeSnapshot {
  return {
    providerKey: ANTHROPIC_PROVIDER_NATIVE_PROVIDER_KEY,
    sourceApi: ANTHROPIC_MESSAGES_SOURCE_API,
    snapshotKey: ANTHROPIC_ASSISTANT_SNAPSHOT_KEY,
    role: 'assistant',
    status: 'final',
    content: [
      { type: 'thinking', thinking: 'private', signature: 'sig-ant' },
      { type: 'text', text: 'previous answer' },
    ],
    stopReason: 'end_turn',
  }
}

async function collectEvents(input?: Readonly<{ signal?: AbortSignal }>) {
  const out: any[] = []
  for await (const event of streamAnthropicTextChatAsDomainEvents({
    requestId: 'anthropic_req_renderer',
    assistantMessageId: 'assistant_1',
    model: 'claude-sonnet-4-5',
    userText: 'hello',
    contextMessages: [{
      role: 'assistant',
      providerId: 'anthropic_messages',
      content: 'previous answer',
      providerNativeContents: [anthropicSnapshot()],
    }],
    signal: input?.signal,
  })) {
    out.push(event)
  }
  return out
}

describe('anthropicTextChat renderer bridge', () => {
  const originalAnthropicChat = (globalThis as any).anthropicChat

  afterEach(() => {
    ;(globalThis as any).anthropicChat = originalAnthropicChat
  })

  it('builds Anthropic Messages from native assistant history', () => {
    expect(buildAnthropicTextChatMessages({
      contextMessages: [
        { role: 'system', content: 'ignored' },
        { role: 'user', content: [{ type: 'text', text: 'prior question' }, { type: 'image', url: 'asset://x' }] },
        {
          role: 'assistant',
          providerId: 'anthropic_messages',
          content: 'prior answer',
          providerNativeContents: [anthropicSnapshot()],
        },
      ],
      userText: 'next question',
    })).toEqual([
      { role: 'user', content: 'prior question' },
      { role: 'assistant', content: 'prior answer', anthropicNativeContent: anthropicSnapshot() },
      { role: 'user', content: 'next question' },
    ])
  })

  it('fails before bridge when Anthropic assistant history lacks native content', () => {
    expect(() => buildAnthropicTextChatMessages({
      contextMessages: [
        { role: 'assistant', providerId: 'anthropic_messages', content: 'legacy answer' },
      ],
      userText: 'next question',
    })).toThrow('missing final native content')
  })

  it('streams native Messages text deltas into DomainEvents', async () => {
    const chunkListeners = new Map<string, (payload: unknown) => void>()
    const endListeners = new Map<string, () => void>()
    const startTextChat = vi.fn(async (payload: any) => {
      expect(payload).toMatchObject({
        requestId: 'anthropic_req_renderer',
        assistantMessageId: 'assistant_1',
          model: 'claude-sonnet-4-5',
          messages: [
          { role: 'assistant', content: 'previous answer', anthropicNativeContent: anthropicSnapshot() },
          { role: 'user', content: 'hello' },
        ],
      })
      expect(JSON.stringify(payload)).not.toContain('Authorization')
      expect(JSON.stringify(payload)).not.toContain('Bearer')
      expect(JSON.stringify(payload)).not.toContain('sk-ant')
      chunkListeners.get(payload.requestId)?.({
        type: 'event',
        event: {
          type: 'message.text_delta',
          messageId: 'assistant_1',
          choiceIndex: 0,
          text: 'hi',
        },
      })
      chunkListeners.get(payload.requestId)?.({
        type: 'event',
        event: { type: 'stream.done' },
      })
      chunkListeners.get(payload.requestId)?.({ type: 'end' })
      endListeners.get(payload.requestId)?.()
      return { ok: true }
    })
    ;(globalThis as any).anthropicChat = {
      startTextChat,
      abortTextChat: vi.fn(async () => ({ ok: true })),
      onTextChatChunk: (requestId: string, callback: (payload: unknown) => void) => {
        chunkListeners.set(requestId, callback)
        return () => chunkListeners.delete(requestId)
      },
      onTextChatEnd: (requestId: string, callback: () => void) => {
        endListeners.set(requestId, callback)
        return () => endListeners.delete(requestId)
      },
    }

    const events = await collectEvents()

    expect(events.some((event) => event.type === 'MessageDeltaText' && event.text === 'hi')).toBe(true)
    expect(events.filter((event) => event.type === 'StreamDone')).toHaveLength(1)
    expect(events.some((event) => event.type === 'StreamError')).toBe(false)
  })

  it('maps missing credential start failure to terminal stream error without stream.done', async () => {
    ;(globalThis as any).anthropicChat = {
      startTextChat: vi.fn(async () => ({
        ok: false,
        code: 'credential_missing',
        error: 'Anthropic API key is not configured.',
      })),
      abortTextChat: vi.fn(async () => ({ ok: true })),
      onTextChatChunk: (_requestId: string, _callback: (payload: unknown) => void) => () => {},
      onTextChatEnd: (_requestId: string, _callback: () => void) => () => {},
    }

    const events = await collectEvents()
    expect(events.filter((event) => event.type === 'StreamError')).toHaveLength(1)
    expect(events.some((event) => event.type === 'StreamDone')).toBe(false)
    const serialized = JSON.stringify(events)
    expect(serialized).not.toContain('Authorization')
    expect(serialized).not.toContain('Bearer')
    expect(serialized).not.toContain('sk-ant')
  })
})

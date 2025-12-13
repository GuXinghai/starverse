import { describe, expect, it } from 'vitest'
import { buildOpenRouterMessages } from './buildMessages'

describe('buildOpenRouterMessages', () => {
  it('default mode does not inject reasoning_details', () => {
    const messages = [
      { role: 'user' as const, content: 'hi' },
      {
        role: 'assistant' as const,
        content: 'hello',
        reasoningDetailsRaw: [{ index: 2 }, { index: 1 }],
      },
    ]
    const out = buildOpenRouterMessages(messages, { mode: 'default' }) as any[]
    expect(out[1]).toMatchObject({ role: 'assistant', content: 'hello' })
    expect(out[1]).not.toHaveProperty('reasoning_details')
  })

  it('advanced mode injects reasoning_details_raw as-is (append-only, no reordering)', () => {
    const raw = [
      { type: 'reasoning.text', index: 2, text: 'b' },
      { type: 'reasoning.text', index: 1, text: 'a' },
    ]
    const messages = [
      { role: 'user' as const, content: 'hi' },
      { role: 'assistant' as const, content: 'hello', reasoningDetailsRaw: raw },
    ]
    const out = buildOpenRouterMessages(messages, { mode: 'advanced_reasoning_blocks' }) as any[]
    expect(out[1].reasoning_details).toEqual(raw)
  })

  it('preserves tool loop structure (assistant tool_calls + tool results)', () => {
    const toolCalls = [
      { id: 'call_1', type: 'function', function: { name: 'getWeather', arguments: '{"city":"SF"}' } },
    ]
    const messages = [
      { role: 'user' as const, content: 'weather?' },
      { role: 'assistant' as const, content: '', toolCalls },
      { role: 'tool' as const, toolCallId: 'call_1', toolName: 'getWeather', content: '{"temp":20}' },
      { role: 'assistant' as const, content: '20C' },
    ]
    const out = buildOpenRouterMessages(messages, { mode: 'default' }) as any[]
    expect(out[1]).toMatchObject({ role: 'assistant', tool_calls: toolCalls })
    expect(out[2]).toMatchObject({ role: 'tool', tool_call_id: 'call_1', name: 'getWeather', content: '{"temp":20}' })
  })

  it('does not inject reasoning blocks by default even in tool loop', () => {
    const toolCalls = [{ id: 'call_1', type: 'function', function: { name: 'tool', arguments: '{}' } }]
    const raw = [{ type: 'reasoning.text', text: 'keep-me', index: 0 }]
    const messages = [
      { role: 'user' as const, content: 'go' },
      { role: 'assistant' as const, content: '', toolCalls, reasoningDetailsRaw: raw },
      { role: 'tool' as const, toolCallId: 'call_1', toolName: 'tool', content: '{"ok":true}' },
    ]
    const out = buildOpenRouterMessages(messages, { mode: 'default' }) as any[]
    expect(out[1]).toMatchObject({ role: 'assistant', tool_calls: toolCalls })
    expect(out[1]).not.toHaveProperty('reasoning_details')
  })

  it('injects reasoning blocks in advanced mode and preserves tool loop structure', () => {
    const toolCalls = [{ id: 'call_1', type: 'function', function: { name: 'tool', arguments: '{}' } }]
    const raw = [{ type: 'reasoning.text', text: 'keep-me', index: 0 }]
    const messages = [
      { role: 'user' as const, content: 'go' },
      { role: 'assistant' as const, content: '', toolCalls, reasoningDetailsRaw: raw },
      { role: 'tool' as const, toolCallId: 'call_1', toolName: 'tool', content: '{"ok":true}' },
      { role: 'assistant' as const, content: 'done' },
    ]
    const out = buildOpenRouterMessages(messages, { mode: 'advanced_reasoning_blocks' }) as any[]
    expect(out[1]).toMatchObject({ role: 'assistant', tool_calls: toolCalls, reasoning_details: raw })
    expect(out[2]).toMatchObject({ role: 'tool', tool_call_id: 'call_1', name: 'tool' })
  })

  it('passes through multimodal content blocks without reordering', () => {
    const multimodal = [
      { type: 'text', text: 'describe this' },
      { type: 'image_url', image_url: { url: 'data:image/png;base64,AAAA' } },
    ]
    const messages = [{ role: 'user' as const, contentBlocks: multimodal }]
    const out = buildOpenRouterMessages(messages, { mode: 'default' }) as any[]
    expect(out[0]).toEqual({ role: 'user', content: multimodal })
  })
})

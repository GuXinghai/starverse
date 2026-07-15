import { describe, expect, it } from 'vitest'
import {
  buildDeepSeekNativeRequestHistoryV1,
  completeDeepSeekNativeRequestV1,
  createDeepSeekNativeHistoryArtifactV1,
  decodeDeepSeekNativeHistoryArtifactV1,
  serializeDeepSeekNativeHistoryArtifactV1,
} from './nativeMessagesV1'

const user = (content: string) => ({ kind: 'client', message: { role: 'user', content } }) as const
const tool = (id: string, content: string) => ({
  kind: 'client', message: { role: 'tool', tool_call_id: id, content },
}) as const
const assistantTool = (id: string, reasoning = 'I need the tool.') => ({
  role: 'assistant', content: 'Checking.', reasoning_content: reasoning,
  tool_calls: [{ id, type: 'function', function: { name: 'weather', arguments: '{"city":"杭州"}' } }],
}) as const

describe('DeepSeek native history V1', () => {
  it('round-trips complete ordered reasoning and tool messages across restart and next user turn', () => {
    const first = completeDeepSeekNativeRequestV1({
      priorArtifact: null,
      requestSequence: 1,
      clientEntries: [user('天气？')],
      assistantMessage: assistantTool('call_1'),
      generatedWithThinking: 'enabled',
    })
    const bytes = serializeDeepSeekNativeHistoryArtifactV1(first)
    const restarted = decodeDeepSeekNativeHistoryArtifactV1(JSON.parse(bytes))
    const requestHistory = buildDeepSeekNativeRequestHistoryV1({
      priorArtifact: restarted,
      clientEntries: [tool('call_1', '{"temperature":20}'), user('再解释一下')],
    })
    expect(requestHistory).toEqual([
      { role: 'user', content: '天气？' },
      assistantTool('call_1'),
      { role: 'tool', tool_call_id: 'call_1', content: '{"temperature":20}' },
      { role: 'user', content: '再解释一下' },
    ])
    expect(serializeDeepSeekNativeHistoryArtifactV1(restarted)).toBe(bytes)
  })

  it('keeps immutable branch prefixes while producing distinct continuations', () => {
    const prefix = completeDeepSeekNativeRequestV1({
      priorArtifact: null, requestSequence: 1, clientEntries: [user('A')],
      assistantMessage: { role: 'assistant', content: 'B', reasoning_content: 'R' },
      generatedWithThinking: 'enabled',
    })
    const left = completeDeepSeekNativeRequestV1({
      priorArtifact: prefix, requestSequence: 2, clientEntries: [user('left')],
      assistantMessage: { role: 'assistant', content: 'L' }, generatedWithThinking: 'disabled',
    })
    const right = completeDeepSeekNativeRequestV1({
      priorArtifact: prefix, requestSequence: 2, clientEntries: [user('right')],
      assistantMessage: { role: 'assistant', content: 'R' }, generatedWithThinking: 'disabled',
    })
    expect(left.artifactHash).not.toBe(right.artifactHash)
    expect(prefix.orderedEntries).toHaveLength(2)
    expect(left.orderedEntries.slice(0, 2)).toEqual(prefix.orderedEntries)
  })

  it('rejects missing thinking reasoning before a tool continuation can be sent', () => {
    expect(() => completeDeepSeekNativeRequestV1({
      priorArtifact: null, requestSequence: 1, clientEntries: [user('天气？')],
      assistantMessage: assistantTool('call_1', ''), generatedWithThinking: 'enabled',
    })).toThrow('GENERATION_V2_DEEPSEEK_THINKING_REASONING_CONTENT_REQUIRED')
    expect(() => createDeepSeekNativeHistoryArtifactV1({
      requestSequence: 1,
      orderedEntries: [user('天气？'), {
        kind: 'assistant', generatedWithThinking: 'enabled',
        message: { role: 'assistant', content: null, tool_calls: assistantTool('call_1').tool_calls },
      }],
    })).toThrow('GENERATION_V2_DEEPSEEK_THINKING_REASONING_CONTENT_REQUIRED')
  })

  it('rejects mismatched, reordered, duplicate and incomplete tool results', () => {
    const twoCalls = createDeepSeekNativeHistoryArtifactV1({
      requestSequence: 1,
      orderedEntries: [user('run'), {
        kind: 'assistant', generatedWithThinking: 'enabled',
        message: {
          role: 'assistant', content: null, reasoning_content: 'R',
          tool_calls: [
            { id: 'call_1', type: 'function', function: { name: 'a', arguments: '{}' } },
            { id: 'call_2', type: 'function', function: { name: 'b', arguments: '{}' } },
          ],
        },
      }],
    })
    expect(() => buildDeepSeekNativeRequestHistoryV1({
      priorArtifact: twoCalls, clientEntries: [tool('call_2', 'wrong')],
    })).toThrow('GENERATION_V2_DEEPSEEK_NATIVE_SEQUENCE_INVALID')
    expect(() => buildDeepSeekNativeRequestHistoryV1({
      priorArtifact: twoCalls, clientEntries: [tool('call_1', 'one')],
    })).toThrow('GENERATION_V2_DEEPSEEK_NATIVE_SEQUENCE_INVALID')
  })

  it('rejects forged artifacts, unknown native fields and accessors', () => {
    const artifact = createDeepSeekNativeHistoryArtifactV1({ requestSequence: 0, orderedEntries: [] })
    expect(() => buildDeepSeekNativeRequestHistoryV1({ priorArtifact: { ...artifact }, clientEntries: [user('x')] }))
      .toThrow('GENERATION_V2_DEEPSEEK_NATIVE_UNBRANDED')
    expect(() => createDeepSeekNativeHistoryArtifactV1({
      requestSequence: 0, orderedEntries: [{ kind: 'client', message: { role: 'user', content: 'x', extra: true } }],
    })).toThrow('GENERATION_V2_DEEPSEEK_NATIVE_UNKNOWN_FIELD')
    expect(() => createDeepSeekNativeHistoryArtifactV1({
      requestSequence: 0,
      orderedEntries: [Object.defineProperty({ kind: 'client' }, 'message', {
        enumerable: true, get: () => ({ role: 'user', content: 'x' }),
      })],
    })).toThrow('GENERATION_V2_DEEPSEEK_NATIVE_INVALID_SHAPE')
  })
})

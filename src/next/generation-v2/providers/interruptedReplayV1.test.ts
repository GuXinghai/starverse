import { describe, expect, it } from 'vitest'
import { interruptedAssistantReplayV1, type InterruptedNativeSnapshotV1 } from '../../../core/generation-v2/providers/interruptedReplayV1'
import { OpenAIResponsesStreamAssemblerV1 } from '../../../core/generation-v2/providers/openai-responses/responsesStreamV1'
import { OpenRouterChatStreamAssemblerV1 } from '../../../core/generation-v2/providers/openrouter/chatStreamV1'
import { DeepSeekStableChatStreamAssemblerV1 } from '../../../core/generation-v2/providers/deepseek/chatStreamV1'
import { GeminiGenerateContentStreamAssemblerV1 } from '../../../core/generation-v2/providers/gemini/generateContentStreamV1'

const snapshot = (items: InterruptedNativeSnapshotV1['items'], completeIndexes: number[] = [], text = '') =>
  ({ items, completeIndexes, text, complete: false })

describe('interrupted native replay protocol boundaries', () => {
  it.each([undefined, null, ''])('retains unavailable OpenAI ciphertext %s locally without replaying it', encrypted_content => {
    const reasoning = { id: 'rs', type: 'reasoning', summary: [],
      ...(encrypted_content === undefined ? {} : { encrypted_content }) }
    const native = snapshot([reasoning], [0], 'partial')
    expect(interruptedAssistantReplayV1('openai_responses', native)).toEqual([
      expect.objectContaining({ type: 'message', status: 'incomplete' }),
    ])
    expect(native.items).toEqual([reasoning])
  })
  it('keeps interrupted OpenRouter citations and returned images without replaying an unfinished tool call', () => {
    const annotations = [{ type: 'url_citation', url_citation: { url: 'https://example.test/source' } }]
    const images = [{ image_url: { url: 'data:image/png;base64,iVBORw==' } }]
    const native = snapshot([{ role: 'assistant', annotations, images, tool_calls: [[0, { id: 'pending', arguments: '{' }]] }], [], 'partial')
    expect(interruptedAssistantReplayV1('openrouter', native)).toEqual([{ role: 'assistant', content: 'partial', images, annotations }])
  })
  it('replays only output_item.done reasoning with its following partial output, preserving ciphertext', () => {
    const stream = new OpenAIResponsesStreamAssemblerV1()
    const push = (type: string, value: Record<string, unknown>) => stream.push({ type, sequenceNumber: 1, value })
    const reasoning = { id: 'rs_1', type: 'reasoning', summary: [], encrypted_content: 'opaque', status: 'completed' }
    push('response.output_item.added', { output_index: 0, item: { ...reasoning, encrypted_content: 'truncated', status: 'in_progress' } })
    expect(interruptedAssistantReplayV1('openai_responses', stream.interruptedSnapshot())).toEqual([])
    push('response.output_item.done', { output_index: 0, item: reasoning })
    push('response.output_item.added', { output_index: 1, item: { id: 'msg_1', type: 'message', role: 'assistant', content: [], status: 'in_progress' } })
    push('response.output_text.delta', { delta: 'partial answer' })
    const replay = interruptedAssistantReplayV1('openai_responses', stream.interruptedSnapshot())
    expect(replay).toEqual([reasoning, expect.objectContaining({ id: 'msg_1', status: 'incomplete', content: [
      { type: 'output_text', text: 'partial answer', annotations: [] },
    ] })])
    expect(JSON.stringify(replay)).not.toContain('truncated')
  })

  it('does not orphan completed reasoning whose associated tool call was never executed', () => {
    const native = snapshot([{ type: 'reasoning', encrypted_content: 'opaque', summary: [], id: 'rs' },
      { type: 'function_call', call_id: 'pending' }], [0, 1])
    expect(interruptedAssistantReplayV1('openai_responses', native)).toEqual([])
  })

  it('keeps signed empty and redacted Claude blocks unchanged, followed by partial text', () => {
    const blocks = [{ type: 'thinking', thinking: '', signature: 'opaque-signature' },
      { type: 'redacted_thinking', data: 'opaque-redacted' }, { type: 'text', text: 'partial' }]
    expect(interruptedAssistantReplayV1('anthropic', snapshot(blocks, [0, 1]))).toEqual([{ role: 'assistant', content: blocks }])
  })

  it('omits the whole unfinished Claude thinking sequence while retaining local native data', () => {
    const native = snapshot([{ type: 'thinking', thinking: 'one', signature: 'signed' },
      { type: 'thinking', thinking: 'two', signature: 'partial-signature' }, { type: 'text', text: 'body' }], [0])
    expect(interruptedAssistantReplayV1('anthropic', native)).toEqual([{ role: 'assistant', content: [{ type: 'text', text: 'body' }] }])
    expect(native.items[1]).toHaveProperty('signature', 'partial-signature')
  })

  it.each(['openrouter', 'deepseek'] as const)('%s never mistakes a body delta for complete reasoning', protocol => {
    const native = snapshot([{ role: 'assistant', reasoning: 'unfinished', reasoning_details: [{ type: 'reasoning.encrypted', data: 'partial' }],
      reasoning_content: 'unfinished' }], [], 'body')
    expect(interruptedAssistantReplayV1(protocol, native)).toEqual([{ role: 'assistant', content: 'body' }])
    expect(interruptedAssistantReplayV1(protocol, { ...native, text: '' })).toEqual([])
  })

  it('uses the OpenRouter finish boundary and preserves its native reasoning sequence', () => {
    const stream = new OpenRouterChatStreamAssemblerV1()
    const details = [{ type: 'reasoning.encrypted', data: 'opaque', id: 'rs_1', format: 'anthropic-claude-v1', index: 0 }]
    stream.push({ id: 'gen-1', model: 'synthetic', choices: [{ index: 0,
      delta: { reasoning_details: details, content: 'body' }, finish_reason: 'stop' }] })
    expect(interruptedAssistantReplayV1('openrouter', stream.interruptedSnapshot())).toEqual([
      expect.objectContaining({ content: 'body', reasoning_details: details }),
    ])
  })

  it('recognizes DeepSeek finish_reason before the DONE/usage transport tail', () => {
    const stream = new DeepSeekStableChatStreamAssemblerV1('enabled')
    const chunk = (finish_reason: string | null, delta: Record<string, unknown>) => ({
      id: 'resp_1', model: 'deepseek-v4-pro', created: 1, system_fingerprint: 'fp_1', object: 'chat.completion.chunk',
      choices: [{ index: 0, delta, finish_reason, logprobs: null }],
    })
    stream.pushChunk(chunk(null, { reasoning_content: 'complete reason', content: 'body' }))
    expect(stream.interruptedSnapshot().complete).toBe(false)
    stream.pushChunk(chunk('stop', {}))
    expect(interruptedAssistantReplayV1('deepseek', stream.interruptedSnapshot())).toEqual([
      { role: 'assistant', content: 'body', reasoning_content: 'complete reason' },
    ])
  })

  it('keeps Gemini signature-only empty parts in their original position and drops unsigned thought fragments', () => {
    const stream = new GeminiGenerateContentStreamAssemblerV1()
    stream.push({ candidates: [{ index: 0, content: { role: 'model', parts: [
      { thought: true, text: 'unfinished thought' }, { text: 'body' }, { text: '', thoughtSignature: 'opaque' },
    ] } }] })
    expect(interruptedAssistantReplayV1('gemini', stream.interruptedSnapshot())).toEqual([
      { role: 'model', parts: [{ text: 'body' }, { text: '', thoughtSignature: 'opaque' }] },
    ])
    expect(stream.interruptedSnapshot().items[0]).toEqual({ thought: true, text: 'unfinished thought' })
  })
})

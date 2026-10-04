import { describe, expect, it } from 'vitest'
import { GenericLocalOpenAIChatStreamAssemblerV1 } from './generic-local-openai-chat/chatStreamV1'
import { OllamaNativeChatStreamAssemblerV1 } from './ollama-chat/chatStreamV1'
import { LmStudioOpenResponsesTypedSseDecoderV1 } from './lmstudio-openresponses/responsesStreamV1'

// Reported model is provenance only: stream decoders surface it verbatim and never compare it
// with the requested model ID (the runners no longer fail on a difference).
const REPORTED = ['model-x', 'model-x-2026-01-15', 'org/served-model-name:q4']

describe.each(REPORTED)('reported model %s', (reported) => {
  it('generic local completes and preserves the raw reported model', () => {
    const a = new GenericLocalOpenAIChatStreamAssemblerV1()
    a.push({ id: 'c1', model: reported, choices: [{ index: 0, delta: { role: 'assistant', content: 'hi' }, finish_reason: null }] })
    a.push({ id: 'c1', model: reported, choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] })
    expect(a.finish()).toMatchObject({ model: reported, finishReason: 'stop', assistantMessage: { content: 'hi' } })
  })
  it('ollama completes and preserves the raw reported model', () => {
    const a = new OllamaNativeChatStreamAssemblerV1()
    a.push({ model: reported, message: { role: 'assistant', content: 'hi' }, done: false })
    a.push({ model: reported, message: { role: 'assistant', content: '' }, done: true, done_reason: 'stop' })
    expect(a.finish()).toMatchObject({ model: reported, doneReason: 'stop' })
  })
  it('lm studio completes and preserves the raw reported model', () => {
    const d = new LmStudioOpenResponsesTypedSseDecoderV1()
    const body = { type: 'response.completed', sequence_number: 0, response: { id: 'r1', model: reported, status: 'completed', output: [] } }
    d.push(new TextEncoder().encode(`event: response.completed\ndata: ${JSON.stringify(body)}\n\n`))
    expect(d.finish()).toMatchObject({ state: 'completed', model: reported })
  })
})

describe('genuine protocol failures still fail', () => {
  it('generic local rejects a model change mid-stream', () => {
    const a = new GenericLocalOpenAIChatStreamAssemblerV1()
    a.push({ id: 'c1', model: 'a', choices: [{ index: 0, delta: { content: 'x' }, finish_reason: null }] })
    expect(() => a.push({ id: 'c1', model: 'b', choices: [] })).toThrow('GENERATION_V2_GENERIC_LOCAL_STREAM_SEQUENCE_INVALID')
  })
  it('ollama rejects a provider error row and a missing terminal', () => {
    expect(() => new OllamaNativeChatStreamAssemblerV1().push({ error: 'boom', model: 'a' })).toThrow('GENERATION_V2_OLLAMA_STREAM_INVALID')
    const a = new OllamaNativeChatStreamAssemblerV1(); a.push({ model: 'a', message: { role: 'assistant', content: 'x' }, done: false })
    expect(() => a.finish()).toThrow('GENERATION_V2_OLLAMA_STREAM_TERMINAL_INVALID')
  })
  it('lm studio keeps a failed response as state failed', () => {
    const d = new LmStudioOpenResponsesTypedSseDecoderV1()
    const body = { type: 'response.failed', sequence_number: 0, response: { id: 'r1', model: 'a', status: 'failed', output: [], error: { message: 'x' } } }
    d.push(new TextEncoder().encode(`event: response.failed\ndata: ${JSON.stringify(body)}\n\n`))
    expect(d.finish().state).toBe('failed')
  })
})

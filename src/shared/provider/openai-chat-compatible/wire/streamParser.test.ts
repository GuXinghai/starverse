import { describe, expect, it } from 'vitest'
import { CompatibleSseWireParser } from './streamParser'
import { CompatibleWireError } from './wireError'

const bytes = (value: string) => new TextEncoder().encode(value)
const sse = (...values: unknown[]) => bytes(values.map((value) => `data: ${typeof value === 'string' ? value : JSON.stringify(value)}\n\n`).join(''))
const chunk = (choices: unknown[], extra: Record<string, unknown> = {}) => ({
  id: 'r1', object: 'chat.completion.chunk', model: 'm1', choices, ...extra,
})

describe('CompatibleSseWireParser', () => {
  it('emits ordered metadata, all choices, content variants, usage, extensions and one DONE terminal', () => {
    const parser = new CompatibleSseWireParser({ expectedChoiceCount: 2 })
    const events = parser.push(sse(
      chunk([
        { index: 1, delta: { role: 'assistant', content: null, reasoning_content: 'r' }, finish_reason: 'length' },
        { index: 0, delta: { role: 'assistant', content: [{ type: 'text', text: 'a' }] }, finish_reason: 'stop', vendor: true },
      ], { usage: { prompt_tokens: 2, total_tokens: 3 }, root_vendor: { ok: true } }),
      '[DONE]',
    ))
    expect(events.filter((event) => event.kind === 'choice_content')).toHaveLength(2)
    expect(events.filter((event) => event.kind === 'choice_finish')).toHaveLength(2)
    expect(events.filter((event) => event.kind === 'extension').map((event) => event.kind === 'extension' && event.candidate.sourcePath)).toEqual([
      ['root_vendor'], ['choices', 1, 'delta', 'reasoning_content'], ['choices', 0, 'vendor'],
    ])
    expect(events.at(-1)).toMatchObject({ kind: 'terminal', outcome: 'done' })
    expect(events.map((event) => event.sequence)).toEqual(events.map((_, index) => index))
  })

  it('allows a choice to recur across chunks but rejects duplicate indexes in one envelope', () => {
    const parser = new CompatibleSseWireParser()
    expect(parser.push(sse(chunk([{ index: 0, delta: { content: 'a' }, finish_reason: null }]))).some((event) => event.kind === 'choice_content')).toBe(true)
    expect(parser.push(sse(chunk([{ index: 0, delta: { content: 'b' }, finish_reason: 'stop' }]), '[DONE]')).at(-1)).toMatchObject({ kind: 'terminal', outcome: 'done' })

    const duplicate = new CompatibleSseWireParser()
    expect(duplicate.push(sse(chunk([
      { index: 0, delta: {}, finish_reason: null },
      { index: 0, delta: {}, finish_reason: null },
    ]))).at(-1)).toMatchObject({ kind: 'terminal', outcome: 'error', error: { network: { code: 'compatible_response_unsupported' } } })
  })

  it('emits unmerged tool fragments scoped by choice and wire sequence', () => {
    const parser = new CompatibleSseWireParser()
    const events = parser.push(sse(chunk([{ index: 0, delta: { tool_calls: [
      { index: 1, id: 'call-1', type: 'function', function: { name: 'lookup', arguments: '{"a"' } },
      { index: 0, function: { arguments: ':1}' } },
    ] }, finish_reason: 'tool_calls' }]), '[DONE]'))
    expect(events.filter((event) => event.kind === 'tool_fragment')).toMatchObject([
      { choiceIndex: 0, fragment: { toolIndex: 1, id: 'call-1', functionName: 'lookup', argumentsFragment: '{"a"' } },
      { choiceIndex: 0, fragment: { toolIndex: 0, argumentsFragment: ':1}' } },
    ])
  })

  it('maps malformed tool fragments to the dedicated code', () => {
    const parser = new CompatibleSseWireParser()
    expect(parser.push(sse(chunk([{ index: 0, delta: { tool_calls: [{ index: 0, function: { arguments: 1 } }] }, finish_reason: null }]))).at(-1))
      .toMatchObject({ kind: 'terminal', outcome: 'error', error: { network: { code: 'compatible_tool_delta_invalid' } } })
  })

  it('distinguishes EOF without DONE, abort, interruption and malformed JSON', () => {
    const eof = new CompatibleSseWireParser()
    eof.push(sse(chunk([{ index: 0, delta: { content: 'a' }, finish_reason: 'stop' }])))
    expect(eof.finish()).toEqual([expect.objectContaining({ kind: 'terminal', outcome: 'eof_without_done' })])
    expect(new CompatibleSseWireParser().abort()).toEqual([expect.objectContaining({ kind: 'terminal', outcome: 'aborted' })])
    expect(new CompatibleSseWireParser().interrupt()).toEqual([expect.objectContaining({ kind: 'terminal', outcome: 'interrupted' })])
    expect(new CompatibleSseWireParser().push(bytes('data: {bad}\n\n')).at(-1)).toMatchObject({
      kind: 'terminal', outcome: 'error', error: { network: { code: 'compatible_sse_malformed' } },
    })
  })

  it('fails terminal completeness for missing or out-of-range choices', () => {
    const missing = new CompatibleSseWireParser({ expectedChoiceCount: 2 })
    expect(missing.push(sse(chunk([{ index: 0, delta: {}, finish_reason: 'stop' }]), '[DONE]')).at(-1)).toMatchObject({ kind: 'terminal', outcome: 'error' })
    const outOfRange = new CompatibleSseWireParser()
    expect(outOfRange.push(sse(chunk([{ index: 1, delta: {}, finish_reason: 'stop' }]))).at(-1)).toMatchObject({ kind: 'terminal', outcome: 'error' })
  })

  it('emits exactly one terminal and rejects late chunks', () => {
    const parser = new CompatibleSseWireParser()
    const events = parser.push(sse(chunk([{ index: 0, delta: {}, finish_reason: 'stop' }]), '[DONE]'))
    expect(events.filter((event) => event.kind === 'terminal')).toHaveLength(1)
    expect(parser.finish()).toEqual([])
    expect(() => parser.push(sse(chunk([])))).toThrow(CompatibleWireError)
  })

  it('keeps a provider error terminal when DONE arrives in the same transport chunk', () => {
    const parser = new CompatibleSseWireParser()
    const events = parser.push(sse({ error: { message: 'private', code: 'vendor' } }, '[DONE]'))
    expect(events).toMatchObject([{ kind: 'terminal', outcome: 'error', error: { network: { code: 'compatible_http_provider' } } }])
    expect(JSON.stringify(events)).not.toContain('private')
  })

  it('preserves earlier semantic events when a later event in the same chunk is malformed', () => {
    const parser = new CompatibleSseWireParser()
    const events = parser.push(bytes(`data: ${JSON.stringify(chunk([{ index: 0, delta: { content: 'kept' }, finish_reason: null }]))}\n\ndata: {bad}\n\n`))
    expect(events).toMatchObject([
      { kind: 'response_meta' },
      { kind: 'choice_content', content: 'kept' },
      { kind: 'choice_finish', finishReason: null },
      { kind: 'terminal', outcome: 'error', error: { network: { code: 'compatible_sse_malformed' } } },
    ])
    expect(events.map((event) => event.sequence)).toEqual([0, 1, 2, 3])
  })

  it('requires every choice to finish and rejects deltas after a non-null finish', () => {
    const unfinished = new CompatibleSseWireParser()
    expect(unfinished.push(sse(chunk([{ index: 0, delta: { content: 'partial' }, finish_reason: null }]), '[DONE]')).at(-1))
      .toMatchObject({ kind: 'terminal', outcome: 'error', error: { network: { code: 'compatible_sse_malformed' } } })

    const late = new CompatibleSseWireParser()
    late.push(sse(chunk([{ index: 0, delta: { content: 'done' }, finish_reason: 'stop' }])))
    expect(late.push(sse(chunk([{ index: 0, delta: { content: 'late' }, finish_reason: null }]))).at(-1))
      .toMatchObject({ kind: 'terminal', outcome: 'error', error: { network: { code: 'compatible_sse_malformed' } } })
  })

  it('rejects unterminated tail bytes after DONE in the same transport chunk', () => {
    const parser = new CompatibleSseWireParser()
    const valid = `data: ${JSON.stringify(chunk([{ index: 0, delta: { content: 'kept' }, finish_reason: 'stop' }]))}\n\n`
    const events = parser.push(bytes(`${valid}data: [DONE]\n\ntrailing`))
    expect(events.some((event) => event.kind === 'choice_content')).toBe(true)
    expect(events.filter((event) => event.kind === 'terminal')).toMatchObject([
      { outcome: 'error', error: { network: { code: 'compatible_sse_malformed' } } },
    ])
  })

  it('accepts an empty choices usage tail after observing the requested choice', () => {
    const parser = new CompatibleSseWireParser()
    const events = parser.push(sse(
      chunk([{ index: 0, delta: { content: 'ok' }, finish_reason: 'stop' }]),
      chunk([], { usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 } }),
      '[DONE]',
    ))
    expect(events.find((event) => event.kind === 'usage')).toMatchObject({ usage: { total_tokens: 2 } })
    expect(events.at(-1)).toMatchObject({ kind: 'terminal', outcome: 'done' })
  })

  it('bounds extension count/value/total without retaining them in the error', () => {
    const parser = new CompatibleSseWireParser({ limits: { maxExtensionValueBytes: 3 } })
    const terminal = parser.push(sse(chunk([{ index: 0, delta: { vendor: 'long' }, finish_reason: null }]))).at(-1)
    expect(terminal).toMatchObject({ kind: 'terminal', outcome: 'error', error: { network: { code: 'compatible_extension_overflow' } } })
    expect(JSON.stringify(terminal)).not.toContain('long')
    const count = new CompatibleSseWireParser({ limits: { maxExtensionCandidates: 1 } })
    expect(count.push(sse(chunk([{ index: 0, delta: { first: 1, second: 2 }, finish_reason: null }]))).at(-1))
      .toMatchObject({ error: { network: { code: 'compatible_extension_overflow' } } })
  })
})

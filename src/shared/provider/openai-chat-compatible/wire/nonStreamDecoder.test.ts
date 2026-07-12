import { describe, expect, it } from 'vitest'
import { mapCompatibleHttpError } from './httpErrorMapper'
import { decodeCompatibleNonStreamResponse } from './nonStreamDecoder'

const bytes = (value: string) => new TextEncoder().encode(value)
const json = (value: unknown) => bytes(JSON.stringify(value))

describe('decodeCompatibleNonStreamResponse', () => {
  it('decodes every indexed choice, roles, content arrays, tools, usage and extensions', () => {
    const events = decodeCompatibleNonStreamResponse({ expectedChoiceCount: 2, bytes: json({
      id: 'r', object: 'chat.completion', model: 'm', vendor_root: 1,
      choices: [
        { index: 1, message: { role: 'assistant', content: null, tool_calls: [{ id: 'c', type: 'function', function: { name: 'f', arguments: '{}' } }] }, finish_reason: 'tool_calls' },
        { index: 0, message: { role: 'assistant', content: [{ type: 'text', text: 'ok' }], vendor_message: true }, finish_reason: 'stop' },
      ], usage: { prompt_tokens: 1, completion_tokens: 2, total_tokens: 3, details: { cached: 1 } },
    }) })
    expect(events.filter((event) => event.kind === 'choice_role')).toHaveLength(2)
    expect(events.find((event) => event.kind === 'tool_fragment')).toMatchObject({ choiceIndex: 1, fragment: { toolIndex: 0, id: 'c', argumentsFragment: '{}' } })
    expect(events.find((event) => event.kind === 'usage')).toMatchObject({ usage: { details: { cached: 1 } } })
    expect(events.at(-1)).toMatchObject({ kind: 'terminal', outcome: 'done' })
  })

  it('rejects empty, missing, duplicate and malformed choice indexes', () => {
    for (const choices of [[], [{ message: { role: 'assistant', content: 'x' }, finish_reason: 'stop' }], [
      { index: 0, message: { role: 'assistant', content: 'x' }, finish_reason: 'stop' },
      { index: 0, message: { role: 'assistant', content: 'y' }, finish_reason: 'stop' },
    ]]) {
      expect(decodeCompatibleNonStreamResponse({ bytes: json({ choices }) }).at(-1)).toMatchObject({ kind: 'terminal', outcome: 'error' })
    }
  })

  it('distinguishes malformed JSON, unsupported shape and overflow', () => {
    expect(decodeCompatibleNonStreamResponse({ bytes: bytes('{bad') }).at(-1)).toMatchObject({ error: { network: { code: 'compatible_json_malformed' } } })
    expect(decodeCompatibleNonStreamResponse({ bytes: json({ choices: [{ index: 0, message: { role: 'assistant', content: {} }, finish_reason: 'stop' }] }) }).at(-1))
      .toMatchObject({ error: { network: { code: 'compatible_response_unsupported' } } })
    expect(decodeCompatibleNonStreamResponse({ bytes: json({ choices: [] }), limits: { maxNonStreamBytes: 2 } }).at(-1))
      .toMatchObject({ error: { network: { code: 'compatible_response_overflow' } } })
    expect(decodeCompatibleNonStreamResponse({ bytes: new Uint8Array([0xff]) }).at(-1))
      .toMatchObject({ error: { network: { code: 'compatible_json_malformed' } } })
  })

  it('normalizes provider error objects without copying message, code or secret values', () => {
    const events = decodeCompatibleNonStreamResponse({ bytes: json({ error: { message: 'secret-output', code: 'bad', type: 'vendor' } }) })
    expect(events).toMatchObject([{ kind: 'terminal', outcome: 'error', error: { diagnostic: {
      category: 'http', providerErrorShape: 'object', providerCodePresent: true, providerTypePresent: true,
    } } }])
    expect(JSON.stringify(events)).not.toContain('secret-output')
    expect(JSON.stringify(events)).not.toContain('"bad"')
  })

  it('bounds decoded JSON depth before semantic traversal', () => {
    let deep: unknown = true
    for (let index = 0; index < 70; index += 1) deep = { nested: deep }
    expect(decodeCompatibleNonStreamResponse({ bytes: json(deep) }).at(-1))
      .toMatchObject({ error: { network: { code: 'compatible_response_overflow' } } })
  })

  it('accepts the exact non-stream body byte limit and rejects one byte less', () => {
    const body = json({ choices: [{ index: 0, message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' }] })
    expect(decodeCompatibleNonStreamResponse({ bytes: body, limits: { maxNonStreamBytes: body.byteLength } }).at(-1))
      .toMatchObject({ kind: 'terminal', outcome: 'done' })
    expect(decodeCompatibleNonStreamResponse({ bytes: body, limits: { maxNonStreamBytes: body.byteLength - 1 } }).at(-1))
      .toMatchObject({ error: { network: { code: 'compatible_response_overflow' } } })
  })

  it('rejects null final finish reasons and incomplete final tool calls', () => {
    const invalidChoices = [
      { index: 0, message: { role: 'assistant', content: 'partial' }, finish_reason: null },
      { index: 0, message: { role: 'assistant', content: null, tool_calls: [{ type: 'function', function: { name: 'f', arguments: '{}' } }] }, finish_reason: 'tool_calls' },
      { index: 0, message: { role: 'assistant', content: null, tool_calls: [{ id: 'c', type: 'function', function: { arguments: '{}' } }] }, finish_reason: 'tool_calls' },
      { index: 0, message: { role: 'assistant', content: null, tool_calls: [{ id: 'c', type: 'function', function: { name: 'f' } }] }, finish_reason: 'tool_calls' },
    ]
    for (const choice of invalidChoices) {
      expect(decodeCompatibleNonStreamResponse({ bytes: json({ choices: [choice] }) }).at(-1))
        .toMatchObject({ kind: 'terminal', outcome: 'error' })
    }
  })
})

describe('mapCompatibleHttpError', () => {
  it.each([[401, 'compatible_http_auth'], [403, 'compatible_http_auth'], [407, 'compatible_http_auth'], [429, 'compatible_http_rate_limit'], [500, 'compatible_http_provider']])(
    'maps HTTP %i to %s with safe shape-only diagnostics',
    (status, code) => {
      const error = mapCompatibleHttpError({ status, body: json({ error: { message: 'do-not-log', code: 'x', type: 'y' } }) })
      expect(error).toMatchObject({ network: { code, httpStatus: status }, diagnostic: { providerErrorShape: 'object', providerCodePresent: true, providerTypePresent: true } })
      expect(JSON.stringify(error)).not.toContain('do-not-log')
    },
  )

  it('handles text, malformed and oversized bodies without echoing content', () => {
    for (const body of [bytes('<html>secret</html>'), bytes('{bad'), bytes('oversized')]) {
      const error = mapCompatibleHttpError({ status: 503, body, maxBytes: 2 })
      expect(error.diagnostic.providerErrorShape).toBe('other')
      expect(JSON.stringify(error)).not.toContain('secret')
      expect(JSON.stringify(error)).not.toContain('oversized')
    }
  })
})

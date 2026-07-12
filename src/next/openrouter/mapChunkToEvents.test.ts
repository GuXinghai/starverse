/* eslint-disable max-lines-per-function */
import { describe, expect, it } from 'vitest'
import { mapChunkToEvents } from './mapChunkToEvents'
import { DEFAULT_OPENROUTER_TEST_MODEL } from './openRouterTestModels'

const testModel = DEFAULT_OPENROUTER_TEST_MODEL

describe('mapChunkToEvents', () => {
  function getMeta(events: ReturnType<typeof mapChunkToEvents>) {
    return events.find((e) => e.type === 'MetaDelta') as Extract<ReturnType<typeof mapChunkToEvents>[number], { type: 'MetaDelta' }> | undefined
  }

  it('maps delta.content to MessageDeltaText', () => {
    const events = mapChunkToEvents({
      messageId: 'm1',
      chunk: {
        id: 'gen_1',
        model: testModel,
        choices: [{ index: 0, delta: { content: 'hi' } }],
      },
    })
    expect(events.some((e) => e.type === 'MetaDelta')).toBe(true)
    expect(events).toContainEqual({ type: 'MessageDeltaText', messageId: 'm1', choiceIndex: 0, text: 'hi' })
  })

  it('maps multimodal delta.content blocks (text + image_url)', () => {
    const events = mapChunkToEvents({
      messageId: 'm1',
      chunk: {
        choices: [
          {
            index: 0,
            delta: {
              content: [
                { type: 'text', text: 'look ' },
                { type: 'image_url', image_url: { url: 'https://example.com/cat.png', detail: 'auto' } },
              ],
            },
          },
        ],
      },
    })
    expect(events).toContainEqual({ type: 'MessageDeltaText', messageId: 'm1', choiceIndex: 0, text: 'look ' })
    expect(events).toContainEqual({
      type: 'MessageAppendContentBlock',
      messageId: 'm1',
      choiceIndex: 0,
      block: { type: 'image', url: 'https://example.com/cat.png' },
    })
  })

  it('maps streaming delta.images to image content blocks', () => {
    const events = mapChunkToEvents({
      messageId: 'm1',
      chunk: {
        choices: [
          {
            index: 0,
            delta: {
              images: [
                {
                  image_url: {
                    url: 'data:image/png;base64,AAAA',
                  },
                },
              ],
            },
          },
        ],
      },
    })
    expect(events).toContainEqual({
      type: 'MessageAppendContentBlock',
      messageId: 'm1',
      choiceIndex: 0,
      block: { type: 'image', url: 'data:image/png;base64,AAAA' },
    })
  })

  it('maps non-stream message.images to image content blocks', () => {
    const events = mapChunkToEvents({
      messageId: 'm1',
      chunk: {
        choices: [
          {
            index: 0,
            message: {
              images: [
                {
                  image_url: {
                    url: 'data:image/webp;base64,BBBB',
                  },
                },
              ],
            },
          },
        ],
      },
    })
    expect(events).toContainEqual({
      type: 'MessageAppendContentBlock',
      messageId: 'm1',
      choiceIndex: 0,
      block: { type: 'image', url: 'data:image/webp;base64,BBBB' },
    })
  })

  it('deduplicates duplicate image URLs across content.image_url and delta.images in one chunk', () => {
    const events = mapChunkToEvents({
      messageId: 'm1',
      chunk: {
        choices: [
          {
            index: 0,
            delta: {
              content: [
                { type: 'image_url', image_url: { url: 'data:image/png;base64,AAAA' } },
              ],
              images: [
                { image_url: { url: 'data:image/png;base64,AAAA' } },
              ],
            },
          },
        ],
      },
    })
    const imageBlocks = events.filter((event: any) => event.type === 'MessageAppendContentBlock')
    expect(imageBlocks).toHaveLength(1)
  })

  it('maps delta.reasoning_details to MessageDeltaReasoningDetail (append-only)', () => {
    const details = [{ type: 'reasoning.text', text: 'a' }, { type: 'reasoning.text', text: 'b' }]
    const events = mapChunkToEvents({
      messageId: 'm1',
      chunkNo: 3,
      chunk: {
        choices: [{ index: 0, delta: { reasoning_details: details } }],
      },
    })
    const mapped = events.filter((e) => e.type === 'MessageDeltaReasoningDetail')
    expect(mapped.map((e: any) => e.detail)).toEqual(details)
    const display = events.filter((e) => e.type === 'MessageAppendReasoningDisplayBlock')
    expect(display).toHaveLength(2)
    expect(display[0]).toMatchObject({
      type: 'MessageAppendReasoningDisplayBlock',
      messageId: 'm1',
      choiceIndex: 0,
      block: {
        type: 'text',
        text: 'a',
        semanticRole: 'reasoning',
        providerKey: 'openrouter',
        ordinal: 3000,
      },
    })
    expect(display[1]).toMatchObject({
      block: {
        type: 'text',
        text: 'b',
        ordinal: 3001,
      },
    })
  })

  it('maps non-stream message.reasoning_details', () => {
    const details = [{ type: 'reasoning.text', text: 'x' }]
    const events = mapChunkToEvents({
      messageId: 'm1',
      chunk: {
        choices: [{ index: 0, message: { content: 'final', reasoning_details: details } }],
      },
    })
    expect(events).toContainEqual({ type: 'MessageDeltaText', messageId: 'm1', choiceIndex: 0, text: 'final' })
    expect(events).toContainEqual({
      type: 'MessageDeltaReasoningDetail',
      messageId: 'm1',
      choiceIndex: 0,
      detail: details[0],
    })
    expect(events).toContainEqual({
      type: 'MessageAppendReasoningDisplayBlock',
      messageId: 'm1',
      choiceIndex: 0,
      block: {
        blockId: 'm1:reasoning-display:openrouter:reasoning_details.reasoning.text:0:0',
        ordinal: 0,
        type: 'text',
        text: 'x',
        semanticRole: 'reasoning',
        providerKey: 'openrouter',
        sourceEventType: 'reasoning_details.reasoning.text',
      },
    })
  })

  it('maps OpenRouter reasoning summary and thought image to reasoning display blocks', () => {
    const events = mapChunkToEvents({
      messageId: 'm1',
      chunkNo: 1,
      chunk: {
        choices: [{
          index: 0,
          delta: {
            reasoning_details: [
              { type: 'reasoning.summary', summary: 'short summary' },
              { type: 'thought_image', image: { url: 'data:image/png;base64,AAAA', mimeType: 'image/png' } },
              { type: 'reasoning.encrypted', data: 'opaque' },
            ],
          },
        }],
      },
    })

    const raw = events.filter((event) => event.type === 'MessageDeltaReasoningDetail')
    const display = events.filter((event) => event.type === 'MessageAppendReasoningDisplayBlock')

    expect(raw).toHaveLength(3)
    expect(display).toHaveLength(2)
    expect(display[0]).toMatchObject({
      block: {
        type: 'text',
        text: 'short summary',
        semanticRole: 'summary',
        ordinal: 1000,
      },
    })
    expect(display[1]).toMatchObject({
      block: {
        type: 'image',
        url: 'data:image/png;base64,AAAA',
        mimeType: 'image/png',
        semanticRole: 'thought',
        ordinal: 1001,
      },
    })
  })

  it('maps usage with empty choices (stream tail)', () => {
    const events = mapChunkToEvents({
      messageId: 'm1',
      chunk: { choices: [], usage: { total_tokens: 123 } },
    })
    expect(events).toContainEqual({ type: 'UsageDelta', usage: { total_tokens: 123 } })
  })

  it('maps top-level error to StreamError terminal and does not infer other semantics', () => {
    const events = mapChunkToEvents({
      messageId: 'm1',
      chunk: { error: { message: 'oops', code: 'upstream_error' }, choices: [{ finish_reason: 'error' }] },
    })
    expect(events).toContainEqual({
      type: 'StreamError',
      error: { message: 'oops', code: 'upstream_error' },
      terminal: true,
    })
  })

  it('tolerates debug chunk with choices=[] (does not assume choices[0])', () => {
    const events = mapChunkToEvents({
      messageId: 'm1',
      chunk: { id: 'gen_dbg_1', model: testModel, choices: [], debug: { echo_upstream_body: { stream: true } } },
    })
    // observable: at minimum, keep generation metadata if present
    expect(events.some((e) => e.type === 'MetaDelta')).toBe(true)
  })

  it('maps delta.tool_calls to MessageDeltaToolCall with mergeStrategy=append', () => {
    const toolCalls = [
      { index: 0, id: 'call_1', type: 'function', function: { name: 'lookup', arguments: '{"q":"' } },
    ]

    const events = mapChunkToEvents({
      messageId: 'm1',
      chunk: { choices: [{ index: 0, delta: { tool_calls: toolCalls } }] },
    })

    expect(events).toContainEqual({
      type: 'MessageDeltaToolCall',
      messageId: 'm1',
      choiceIndex: 0,
      mergeStrategy: 'append',
      toolCallDeltas: toolCalls,
    })
  })

  it('maps non-stream message.tool_calls to MessageDeltaToolCall with mergeStrategy=replace', () => {
    const toolCalls = [
      { index: 0, id: 'call_1', type: 'function', function: { name: 'lookup', arguments: '{"q":"x"}' } },
    ]

    const events = mapChunkToEvents({
      messageId: 'm1',
      chunk: { choices: [{ index: 0, message: { content: 'ok', tool_calls: toolCalls } }] },
    })

    const toolEv = events.find((e: any) => e.type === 'MessageDeltaToolCall')
    expect(toolEv).toEqual({
      type: 'MessageDeltaToolCall',
      messageId: 'm1',
      choiceIndex: 0,
      mergeStrategy: 'replace',
      toolCallDeltas: toolCalls,
    })
  })

  it('maps delta.annotations to MessageDeltaAnnotationBatch with mergeStrategy=append', () => {
    const annotations = [
      {
        type: 'url_citation',
        url_citation: { url: 'https://example.com/a', title: 'A', start_index: 1, end_index: 4 },
      },
    ]

    const events = mapChunkToEvents({
      messageId: 'm1',
      chunk: { choices: [{ index: 0, delta: { annotations } }] },
    })

    expect(events).toContainEqual({
      type: 'MessageDeltaAnnotationBatch',
      messageId: 'm1',
      choiceIndex: 0,
      mergeStrategy: 'append',
      annotations,
    })
  })

  it('maps non-stream message.annotations to MessageDeltaAnnotationBatch with mergeStrategy=replace', () => {
    const annotations = [
      {
        type: 'url_citation',
        url_citation: { url: 'https://example.com/final', start_index: 0, end_index: 0 },
      },
    ]

    const events = mapChunkToEvents({
      messageId: 'm1',
      chunk: { choices: [{ index: 0, message: { content: 'ok', annotations } }] },
    })

    expect(events).toContainEqual({
      type: 'MessageDeltaAnnotationBatch',
      messageId: 'm1',
      choiceIndex: 0,
      mergeStrategy: 'replace',
      annotations,
    })
  })

  it('tolerates reasoning_details elements missing text/summary/data (keeps raw object)', () => {
    const detail = { type: 'reasoning.summary', format: 'json', index: 0 }
    const events = mapChunkToEvents({
      messageId: 'm1',
      chunk: { choices: [{ index: 0, delta: { reasoning_details: [detail] } }] },
    })
    expect(events).toContainEqual({
      type: 'MessageDeltaReasoningDetail',
      messageId: 'm1',
      choiceIndex: 0,
      detail,
    })
  })

  it('normalizes unknown finish_reason to unknown while preserving native_finish_reason', () => {
    const events = mapChunkToEvents({
      messageId: 'm1',
      chunk: {
        id: 'gen_future',
        choices: [{ index: 0, finish_reason: 'provider_new_reason' }],
      },
    })
    const meta = getMeta(events)
    expect(meta?.meta.finish_reason).toBe('unknown')
    expect(meta?.meta.native_finish_reason).toBe('provider_new_reason')
  })

  it('keeps explicit native_finish_reason verbatim even when finish_reason is unknown', () => {
    const events = mapChunkToEvents({
      messageId: 'm1',
      chunk: {
        id: 'gen_native',
        choices: [{ index: 0, finish_reason: 'future_reason', native_finish_reason: 'upstream.future_reason' }],
      },
    })
    const meta = getMeta(events)
    expect(meta?.meta.finish_reason).toBe('unknown')
    expect(meta?.meta.native_finish_reason).toBe('upstream.future_reason')
  })

  it('keeps known finish_reason values unchanged (length/content_filter)', () => {
    const lengthMeta = getMeta(
      mapChunkToEvents({
        messageId: 'm1',
        chunk: {
          choices: [{ index: 0, finish_reason: 'length' }],
        },
      })
    )
    const contentFilterMeta = getMeta(
      mapChunkToEvents({
        messageId: 'm1',
        chunk: {
          choices: [{ index: 0, finish_reason: 'content_filter' }],
        },
      })
    )

    expect(lengthMeta?.meta.finish_reason).toBe('length')
    expect(lengthMeta?.meta.native_finish_reason).toBe('length')
    expect(contentFilterMeta?.meta.finish_reason).toBe('content_filter')
    expect(contentFilterMeta?.meta.native_finish_reason).toBe('content_filter')
  })
})

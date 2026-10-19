import { describe, expect, it } from 'vitest'
import { decodeLmStudioOpenResponsesReturnedItemsV1 } from '../../../../core/generation-v2/providers/lmstudio-openresponses/nativeItemsV1'
import { LmStudioOpenResponsesTypedSseDecoderV1, restoreLmStudioOpenResponsesStreamResultV1 } from '../../../../core/generation-v2/providers/lmstudio-openresponses/responsesStreamV1'

describe('LM Studio OpenResponses terminal receipt restoration', () => {
  it.each(['failed', 'incomplete'] as const)('retains the provider %s outcome and native output', state => {
    const returnedItems = [{ id: 'msg_partial', type: 'message', role: 'assistant', status: 'completed',
      content: [{ type: 'output_text', text: 'partial answer', annotations: [], logprobs: [] }] }]
    const restored = restoreLmStudioOpenResponsesStreamResultV1({
      state, returnedItems, responseId: 'resp_terminal', model: 'local-model',
      usage: { input_tokens: 7, output_tokens: 3 },
      error: state === 'failed' ? { code: 'server_error', message: 'provider failed' } : null,
    })
    expect(restored).toMatchObject({ state, returnedItems, responseId: 'resp_terminal',
      usage: { input_tokens: 7, output_tokens: 3 },
      error: state === 'failed' ? { code: 'server_error', message: 'provider failed' } : null })
  })

  it('preserves a legal incomplete native message on terminal restore and decode', () => {
    const incompleteMessage = { id: 'msg_partial', type: 'message', role: 'assistant', status: 'incomplete',
      content: [{ type: 'output_text', text: 'partial answer', annotations: [], logprobs: [] }] }
    const restored = restoreLmStudioOpenResponsesStreamResultV1({
      state: 'incomplete', returnedItems: [incompleteMessage], responseId: 'resp_terminal', model: 'local-model',
      usage: null, error: null,
    })
    expect(restored.returnedItems[0]).toMatchObject({ status: 'incomplete', content: [{ text: 'partial answer' }] })
    expect(() => decodeLmStudioOpenResponsesReturnedItemsV1([incompleteMessage])).toThrow(
      'GENERATION_V2_LMSTUDIO_NATIVE_ITEM_INVALID_VALUE',
    )
  })

  it('decodes response.incomplete without fabricating completed item status', () => {
    const decoder = new LmStudioOpenResponsesTypedSseDecoderV1()
    const response = { id: 'resp_terminal', model: 'local-model', status: 'incomplete',
      output: [{ id: 'msg_partial', type: 'message', role: 'assistant', status: 'incomplete',
        content: [{ type: 'output_text', text: 'partial answer', annotations: [], logprobs: [] }] }] }
    decoder.push(new TextEncoder().encode(`event: response.incomplete\ndata: ${JSON.stringify({
      type: 'response.incomplete', sequence_number: 0, response,
    })}\n\n`))
    expect(decoder.finish()).toMatchObject({ state: 'incomplete', returnedItems: [{ status: 'incomplete' }] })
  })

  it('enforces the configured test budget before retaining parsed wire facts', () => {
    const decoder = new LmStudioOpenResponsesTypedSseDecoderV1(undefined, 512)
    expect(() => decoder.push(new Uint8Array(513)))
      .toThrow('GENERATION_V2_LMSTUDIO_STREAM_LIMIT_EXCEEDED')
  })

  it('rejects receipt data outside the native terminal contract', () => {
    expect(() => restoreLmStudioOpenResponsesStreamResultV1({
      state: 'cancelled', returnedItems: [], responseId: 'resp_terminal', model: 'local-model', usage: null, error: null,
    })).toThrow('GENERATION_V2_LMSTUDIO_STREAM_TERMINAL_INVALID')
  })
})

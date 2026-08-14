import { describe, expect, it } from 'vitest'
import {
  OPENAI_COMPATIBLE_NON_STREAM_RESPONSE_MAX_BYTES_V2,
  OPENAI_COMPATIBLE_RESPONSE_TOO_LARGE_ERROR_V2,
  readOpenAICompatibleJsonResponseBytesV2,
} from './openAIChatCompatibleResponseBodyV2'

describe('OpenAI-compatible non-stream response body guard', () => {
  it('rejects a response whose declared content length is over 16 MiB before reading it', async () => {
    const response = new Response('small', {
      headers: { 'content-length': String(OPENAI_COMPATIBLE_NON_STREAM_RESPONSE_MAX_BYTES_V2 + 1) },
    })

    await expect(readOpenAICompatibleJsonResponseBytesV2(response))
      .rejects.toThrow(OPENAI_COMPATIBLE_RESPONSE_TOO_LARGE_ERROR_V2)
  })

  it('cancels a response once streamed bytes exceed 16 MiB without a declared length', async () => {
    let cancelled = false
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(OPENAI_COMPATIBLE_NON_STREAM_RESPONSE_MAX_BYTES_V2))
        controller.enqueue(new Uint8Array([1]))
      },
      cancel() { cancelled = true },
    })
    const response = new Response(stream)

    await expect(readOpenAICompatibleJsonResponseBytesV2(response))
      .rejects.toThrow(OPENAI_COMPATIBLE_RESPONSE_TOO_LARGE_ERROR_V2)
    expect(cancelled).toBe(true)
  })
})

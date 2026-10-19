import { describe, expect, it } from 'vitest'
import { readBoundedResponseBodyV2, readBoundedResponseTextV2 } from './boundedResponseBodyV2'

describe('bounded response body reader', () => {
  it('returns the full body when it ends exactly at the limit', async () => {
    const response = new Response(new TextEncoder().encode('four'))

    const result = await readBoundedResponseBodyV2(response, 4)

    expect(new TextDecoder().decode(result.bytes)).toBe('four')
    expect(result.truncated).toBe(false)
    expect(response.body?.locked).toBe(false)
  })

  it('returns a bounded prefix and marks truncation when more bytes arrive', async () => {
    let cancelled = false
    const response = new Response(new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('abc'))
        controller.enqueue(new TextEncoder().encode('def'))
      },
      cancel() { cancelled = true },
    }))

    const result = await readBoundedResponseBodyV2(response, 4)

    expect(new TextDecoder().decode(result.bytes)).toBe('abcd')
    expect(result.truncated).toBe(true)
    expect(cancelled).toBe(true)
    expect(response.body?.locked).toBe(false)
  })

  it('makes text-body truncation explicit and reports retained bytes', async () => {
    const response = new Response(new TextEncoder().encode('abcdef'))

    const result = await readBoundedResponseTextV2(response, 3)

    expect(result).toEqual({
      text: 'abc\n[response body truncated after 3 bytes]',
      byteLength: 3,
      truncated: true,
    })
  })
})

export type BoundedResponseBodyV2 = Readonly<{
  bytes: Uint8Array
  truncated: boolean
}>

export type BoundedResponseTextV2 = Readonly<{
  text: string
  byteLength: number
  truncated: boolean
}>

export const PROVIDER_ERROR_RESPONSE_BODY_MAX_BYTES_V2 = 256 * 1024

export async function readBoundedResponseBodyV2(
  response: Response,
  maxBytes: number,
): Promise<BoundedResponseBodyV2> {
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 0) {
    throw new RangeError('GENERATION_V2_RESPONSE_BODY_LIMIT_INVALID')
  }
  if (!response.body) return Object.freeze({ bytes: new Uint8Array(), truncated: false })

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let totalBytes = 0
  let truncated = false
  try {
    while (true) {
      const item = await reader.read()
      if (item.done) break
      if (!item.value.byteLength) continue

      const remaining = maxBytes - totalBytes
      if (item.value.byteLength > remaining) {
        if (remaining > 0) chunks.push(item.value.slice(0, remaining))
        totalBytes += Math.max(remaining, 0)
        truncated = true
        break
      }
      chunks.push(item.value.slice())
      totalBytes += item.value.byteLength
    }

    const bytes = new Uint8Array(totalBytes)
    let offset = 0
    for (const chunk of chunks) {
      bytes.set(chunk, offset)
      offset += chunk.byteLength
    }
    return Object.freeze({ bytes, truncated })
  } finally {
    for (const chunk of chunks) chunk.fill(0)
    try { await reader.cancel() } catch { /* best effort */ }
    reader.releaseLock()
  }
}

export async function readBoundedResponseTextV2(
  response: Response,
  maxBytes: number,
): Promise<BoundedResponseTextV2> {
  const body = await readBoundedResponseBodyV2(response, maxBytes)
  try {
    const text = new TextDecoder().decode(body.bytes)
    return Object.freeze({
      text: body.truncated
        ? `${text}\n[response body truncated after ${body.bytes.byteLength} bytes]`
        : text,
      byteLength: body.bytes.byteLength,
      truncated: body.truncated,
    })
  } finally {
    body.bytes.fill(0)
  }
}

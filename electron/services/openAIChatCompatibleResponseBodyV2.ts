export const OPENAI_COMPATIBLE_NON_STREAM_RESPONSE_MAX_BYTES_V2 = 16 * 1024 * 1024
export const OPENAI_COMPATIBLE_RESPONSE_TOO_LARGE_ERROR_V2 = 'GENERATION_V2_OPENAI_COMPATIBLE_RUNNER_RESPONSE_TOO_LARGE'

function declaredContentLength(response: Response): number | null {
  const value = response.headers.get('content-length')?.trim()
  if (!value || !/^\d+$/.test(value)) return null
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) ? parsed : null
}

export async function readOpenAICompatibleJsonResponseBytesV2(response: Response): Promise<Uint8Array> {
  const maxBytes = OPENAI_COMPATIBLE_NON_STREAM_RESPONSE_MAX_BYTES_V2
  const declared = declaredContentLength(response)
  if (declared !== null && declared > maxBytes) {
    try { await response.body?.cancel() } catch { /* best effort */ }
    throw new Error(OPENAI_COMPATIBLE_RESPONSE_TOO_LARGE_ERROR_V2)
  }
  if (!response.body) throw new Error('GENERATION_V2_OPENAI_COMPATIBLE_RUNNER_RESPONSE_INVALID')

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let totalBytes = 0
  try {
    while (true) {
      const item = await reader.read()
      if (item.done) break
      if (!item.value.byteLength) continue
      if (item.value.byteLength > maxBytes - totalBytes) {
        throw new Error(OPENAI_COMPATIBLE_RESPONSE_TOO_LARGE_ERROR_V2)
      }
      chunks.push(item.value)
      totalBytes += item.value.byteLength
    }

    const bytes = new Uint8Array(totalBytes)
    let offset = 0
    for (const chunk of chunks) {
      bytes.set(chunk, offset)
      offset += chunk.byteLength
      chunk.fill(0)
    }
    return bytes
  } finally {
    for (const chunk of chunks) chunk.fill(0)
    try { await reader.cancel() } catch { /* best effort */ }
    reader.releaseLock()
  }
}

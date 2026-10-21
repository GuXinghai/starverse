import { readBoundedResponseBodyV2 } from '../net/boundedResponseBodyV2'

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
  const result = await readBoundedResponseBodyV2(response, maxBytes)
  if (result.truncated) {
    result.bytes.fill(0)
    throw new Error(OPENAI_COMPATIBLE_RESPONSE_TOO_LARGE_ERROR_V2)
  }
  return result.bytes
}

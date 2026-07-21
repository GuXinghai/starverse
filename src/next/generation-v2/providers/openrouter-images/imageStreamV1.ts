import { stableSerializeProviderRequestBoundedV2 } from '../../compiler/stableSerialize'

const MAX_FRAME_BYTES = 24 * 1024 * 1024
const MAX_STREAM_BYTES = 64 * 1024 * 1024
const MAX_IMAGE_BYTES = 32 * 1024 * 1024
const MAX_USAGE_BYTES = 1024 * 1024

export type OpenRouterImagePartialEventV1 = Readonly<{
  type: 'partial'
  partialImageIndex: 0
  base64: string
}>

export type OpenRouterImageCompletedEventV1 = Readonly<{
  type: 'completed'
  bytes: Uint8Array
  mime: string
  createdAtMs: number
  usage: Readonly<Record<string, unknown>>
}>

export type OpenRouterImageProviderErrorEventV1 = Readonly<{
  type: 'provider_error'
  code: string
  message: string
}>

export type OpenRouterImageSseEventV1 =
  | OpenRouterImagePartialEventV1
  | OpenRouterImageCompletedEventV1
  | OpenRouterImageProviderErrorEventV1
  | Readonly<{ type: 'done' }>

const results = new WeakSet<object>()
export type OpenRouterImageSingleResultV1 = Readonly<{
  bytes: Uint8Array
  mime: string
  createdAtMs: number
  usage: Readonly<Record<string, unknown>>
}>

export function isOpenRouterImageSingleResultV1(value: unknown): value is OpenRouterImageSingleResultV1 {
  return Boolean(value && typeof value === 'object' && results.has(value))
}

export class OpenRouterImageStreamV1Error extends Error {
  constructor(readonly code:
    | 'GENERATION_V2_OPENROUTER_IMAGE_STREAM_INVALID_SSE'
    | 'GENERATION_V2_OPENROUTER_IMAGE_STREAM_LIMIT_EXCEEDED'
    | 'GENERATION_V2_OPENROUTER_IMAGE_STREAM_INVALID_EVENT'
    | 'GENERATION_V2_OPENROUTER_IMAGE_STREAM_TEXT_CHUNK_UNSUPPORTED'
    | 'GENERATION_V2_OPENROUTER_IMAGE_STREAM_MULTI_IMAGE_UNSUPPORTED'
    | 'GENERATION_V2_OPENROUTER_IMAGE_STREAM_TERMINAL_INVALID'
    | 'GENERATION_V2_OPENROUTER_IMAGE_STREAM_PROVIDER_FAILED') {
    super(code)
    this.name = 'OpenRouterImageStreamV1Error'
  }
}

function fail(code: OpenRouterImageStreamV1Error['code']): never {
  throw new OpenRouterImageStreamV1Error(code)
}

function closedObject(value: unknown): Readonly<Record<string, unknown>> {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) {
    return fail('GENERATION_V2_OPENROUTER_IMAGE_STREAM_INVALID_EVENT')
  }
  const descriptors = Object.getOwnPropertyDescriptors(value)
  if (Reflect.ownKeys(value).some((key) => typeof key !== 'string') ||
      Object.values(descriptors).some((descriptor) => !descriptor.enumerable || !('value' in descriptor) ||
        descriptor.value === undefined)) {
    return fail('GENERATION_V2_OPENROUTER_IMAGE_STREAM_INVALID_EVENT')
  }
  return Object.freeze(Object.fromEntries(Object.entries(descriptors).map(([key, descriptor]) => [key, descriptor.value])))
}

function exactKeys(value: Readonly<Record<string, unknown>>, allowed: readonly string[]): void {
  if (Object.keys(value).some((key) => !allowed.includes(key))) {
    fail('GENERATION_V2_OPENROUTER_IMAGE_STREAM_INVALID_EVENT')
  }
}

function boundedString(value: unknown, max: number, code = 'GENERATION_V2_OPENROUTER_IMAGE_STREAM_INVALID_EVENT'): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > max || /[\u0000]/u.test(value)) {
    return fail(code as OpenRouterImageStreamV1Error['code'])
  }
  return value
}

function readBase64(value: unknown): Readonly<{ base64: string; bytes: Uint8Array }> {
  const base64 = boundedString(value, Math.ceil(MAX_IMAGE_BYTES / 3) * 4 + 4)
  if (base64.length % 4 !== 0 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(base64)) {
    return fail('GENERATION_V2_OPENROUTER_IMAGE_STREAM_INVALID_EVENT')
  }
  const bytes = new Uint8Array(Buffer.from(base64, 'base64'))
  if (bytes.byteLength < 1 || bytes.byteLength > MAX_IMAGE_BYTES || Buffer.from(bytes).toString('base64') !== base64) {
    return fail('GENERATION_V2_OPENROUTER_IMAGE_STREAM_INVALID_EVENT')
  }
  return Object.freeze({ base64, bytes })
}

function readMime(value: unknown): string {
  const mime = boundedString(value, 255).toLowerCase()
  if (mime !== value || !/^image\/[a-z0-9][a-z0-9!#$&^_.+*-]*$/u.test(mime)) {
    return fail('GENERATION_V2_OPENROUTER_IMAGE_STREAM_INVALID_EVENT')
  }
  return mime
}

function readCreatedAtMs(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0 || (value as number) > Math.floor(Number.MAX_SAFE_INTEGER / 1000)) {
    return fail('GENERATION_V2_OPENROUTER_IMAGE_STREAM_INVALID_EVENT')
  }
  return (value as number) * 1000
}

function readUsage(value: unknown): Readonly<Record<string, unknown>> {
  const usage = closedObject(value)
  try {
    stableSerializeProviderRequestBoundedV2(usage, MAX_USAGE_BYTES)
  } catch {
    return fail('GENERATION_V2_OPENROUTER_IMAGE_STREAM_INVALID_EVENT')
  }
  return usage
}

function readPartial(value: Readonly<Record<string, unknown>>): OpenRouterImagePartialEventV1 {
  exactKeys(value, ['type', 'partial_image_index', 'b64_json'])
  if (value.type !== 'image_generation.partial_image' || value.partial_image_index !== 0) {
    return fail(value.partial_image_index === 0
      ? 'GENERATION_V2_OPENROUTER_IMAGE_STREAM_INVALID_EVENT'
      : 'GENERATION_V2_OPENROUTER_IMAGE_STREAM_MULTI_IMAGE_UNSUPPORTED')
  }
  const image = readBase64(value.b64_json)
  image.bytes.fill(0)
  return Object.freeze({ type: 'partial', partialImageIndex: 0, base64: image.base64 })
}

function readCompleted(value: Readonly<Record<string, unknown>>): OpenRouterImageCompletedEventV1 {
  exactKeys(value, ['type', 'b64_json', 'media_type', 'created', 'usage'])
  if (value.type !== 'image_generation.completed') return fail('GENERATION_V2_OPENROUTER_IMAGE_STREAM_INVALID_EVENT')
  const image = readBase64(value.b64_json)
  return Object.freeze({
    type: 'completed', bytes: image.bytes, mime: readMime(value.media_type),
    createdAtMs: readCreatedAtMs(value.created), usage: readUsage(value.usage),
  })
}

/** Decodes the documented non-streaming `{created,data:[...],usage}` response for `n:1`. */
export function decodeOpenRouterImageBufferedResponseV1(value: unknown): OpenRouterImageSingleResultV1 {
  const response = closedObject(value)
  exactKeys(response, ['created', 'data', 'usage'])
  if (!Array.isArray(response.data) || response.data.length !== 1 || Object.getPrototypeOf(response.data) !== Array.prototype) {
    return fail('GENERATION_V2_OPENROUTER_IMAGE_STREAM_MULTI_IMAGE_UNSUPPORTED')
  }
  const keys = Reflect.ownKeys(response.data)
  if (keys.length !== 2 || !keys.includes('0') || !keys.includes('length')) {
    return fail('GENERATION_V2_OPENROUTER_IMAGE_STREAM_INVALID_EVENT')
  }
  const item = closedObject(response.data[0])
  exactKeys(item, ['b64_json', 'media_type'])
  const image = readBase64(item.b64_json)
  const result = Object.freeze({
    bytes: image.bytes, mime: readMime(item.media_type), createdAtMs: readCreatedAtMs(response.created),
    usage: readUsage(response.usage),
  })
  results.add(result)
  return result
}

function readProviderError(value: Readonly<Record<string, unknown>>): OpenRouterImageProviderErrorEventV1 {
  exactKeys(value, ['type', 'error'])
  if (value.type !== 'error') return fail('GENERATION_V2_OPENROUTER_IMAGE_STREAM_INVALID_EVENT')
  const error = closedObject(value.error)
  exactKeys(error, ['message', 'code'])
  return Object.freeze({
    type: 'provider_error', code: boundedString(error.code, 512), message: boundedString(error.message, 4096),
  })
}

function parseJsonEvent(raw: string): OpenRouterImageSseEventV1 {
  let parsed: unknown
  try { parsed = JSON.parse(raw) } catch { return fail('GENERATION_V2_OPENROUTER_IMAGE_STREAM_INVALID_SSE') }
  const value = closedObject(parsed)
  if (value.type === 'image_generation.partial_image') return readPartial(value)
  if (value.type === 'image_generation.completed') return readCompleted(value)
  if (value.type === 'image_generation.text_chunk') return fail('GENERATION_V2_OPENROUTER_IMAGE_STREAM_TEXT_CHUNK_UNSUPPORTED')
  if (value.type === 'error') return readProviderError(value)
  return fail('GENERATION_V2_OPENROUTER_IMAGE_STREAM_INVALID_EVENT')
}

/** Strictly decodes only the current documented single-image Images SSE wire. */
export class OpenRouterImageSseDecoderV1 {
  readonly #decoder = new TextDecoder('utf-8', { fatal: true })
  #buffer = ''
  #wireBytes = 0
  #doneSeen = false
  #finished = false

  push(bytes: Uint8Array): readonly OpenRouterImageSseEventV1[] {
    if (this.#finished || !ArrayBuffer.isView(bytes) || bytes instanceof DataView ||
        Object.prototype.toString.call(bytes) !== '[object Uint8Array]') {
      return fail('GENERATION_V2_OPENROUTER_IMAGE_STREAM_INVALID_SSE')
    }
    this.#wireBytes += bytes.byteLength
    if (this.#wireBytes > MAX_STREAM_BYTES) return fail('GENERATION_V2_OPENROUTER_IMAGE_STREAM_LIMIT_EXCEEDED')
    try { this.#buffer += this.#decoder.decode(bytes, { stream: true }) } catch {
      return fail('GENERATION_V2_OPENROUTER_IMAGE_STREAM_INVALID_SSE')
    }
    return this.#drain(false)
  }

  finish(): readonly OpenRouterImageSseEventV1[] {
    if (this.#finished) return fail('GENERATION_V2_OPENROUTER_IMAGE_STREAM_INVALID_SSE')
    this.#finished = true
    try { this.#buffer += this.#decoder.decode() } catch {
      return fail('GENERATION_V2_OPENROUTER_IMAGE_STREAM_INVALID_SSE')
    }
    const events = this.#drain(true)
    if (this.#buffer.length !== 0 || !this.#doneSeen) return fail('GENERATION_V2_OPENROUTER_IMAGE_STREAM_TERMINAL_INVALID')
    return events
  }

  #drain(final: boolean): readonly OpenRouterImageSseEventV1[] {
    const output: OpenRouterImageSseEventV1[] = []
    while (true) {
      const match = /\r?\n\r?\n/u.exec(this.#buffer)
      if (!match || match.index === undefined) break
      const frame = this.#buffer.slice(0, match.index)
      this.#buffer = this.#buffer.slice(match.index + match[0].length)
      if (Buffer.byteLength(frame, 'utf8') > MAX_FRAME_BYTES) return fail('GENERATION_V2_OPENROUTER_IMAGE_STREAM_LIMIT_EXCEEDED')
      if (this.#doneSeen) return fail('GENERATION_V2_OPENROUTER_IMAGE_STREAM_INVALID_SSE')
      const data: string[] = []
      for (const line of frame.split(/\r?\n/u)) {
        if (line === 'data' || line.startsWith('data:')) data.push(line === 'data' ? '' : line.slice(5).replace(/^ /u, ''))
        else if (line.length !== 0) return fail('GENERATION_V2_OPENROUTER_IMAGE_STREAM_INVALID_SSE')
      }
      if (data.length === 0) return fail('GENERATION_V2_OPENROUTER_IMAGE_STREAM_INVALID_SSE')
      const raw = data.join('\n')
      if (raw === '[DONE]') {
        this.#doneSeen = true
        output.push(Object.freeze({ type: 'done' as const }))
      } else {
        output.push(parseJsonEvent(raw))
      }
    }
    if (final && this.#buffer.trim().length === 0) this.#buffer = ''
    return Object.freeze(output)
  }
}

export class OpenRouterImageSingleResultAssemblerV1 {
  #completed: OpenRouterImageCompletedEventV1 | null = null
  #providerError: OpenRouterImageProviderErrorEventV1 | null = null
  #done = false
  #finished = false

  push(event: OpenRouterImageSseEventV1): void {
    if (this.#finished) return fail('GENERATION_V2_OPENROUTER_IMAGE_STREAM_TERMINAL_INVALID')
    if (event.type === 'partial') return
    if (event.type === 'provider_error') {
      if (this.#providerError || this.#completed) return fail('GENERATION_V2_OPENROUTER_IMAGE_STREAM_TERMINAL_INVALID')
      this.#providerError = event
      return
    }
    if (event.type === 'completed') {
      if (this.#completed || this.#providerError) return fail('GENERATION_V2_OPENROUTER_IMAGE_STREAM_MULTI_IMAGE_UNSUPPORTED')
      this.#completed = event
      return
    }
    if (this.#done) return fail('GENERATION_V2_OPENROUTER_IMAGE_STREAM_TERMINAL_INVALID')
    this.#done = true
  }

  finish(): OpenRouterImageSingleResultV1 {
    if (this.#finished || !this.#done) return fail('GENERATION_V2_OPENROUTER_IMAGE_STREAM_TERMINAL_INVALID')
    this.#finished = true
    if (this.#providerError) return fail('GENERATION_V2_OPENROUTER_IMAGE_STREAM_PROVIDER_FAILED')
    if (!this.#completed) return fail('GENERATION_V2_OPENROUTER_IMAGE_STREAM_TERMINAL_INVALID')
    const result = Object.freeze({
      bytes: this.#completed.bytes, mime: this.#completed.mime,
      createdAtMs: this.#completed.createdAtMs, usage: this.#completed.usage,
    })
    results.add(result)
    return result
  }
}

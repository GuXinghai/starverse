import { stableSerializeProviderRequestBoundedV2 } from '../../compiler/stableSerialize'
import { isGeminiInteractionsImageModelIdV1 } from './interactionsImageCapabilityPolicyV1'

const MAX_STREAM_BYTES = 48 * 1024 * 1024
const MAX_FRAME_BYTES = 24 * 1024 * 1024
const MAX_ARTIFACT_BYTES = 48 * 1024 * 1024
const ALLOWED_IMAGE_MIMES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/heic', 'image/heif', 'image/gif', 'image/bmp', 'image/tiff'])

export class GeminiInteractionsImageStreamV1Error extends Error {
  constructor(readonly code:
    | 'GENERATION_V2_GEMINI_INTERACTIONS_STREAM_INVALID_SSE'
    | 'GENERATION_V2_GEMINI_INTERACTIONS_STREAM_INVALID_EVENT'
    | 'GENERATION_V2_GEMINI_INTERACTIONS_STREAM_LIMIT_EXCEEDED'
    | 'GENERATION_V2_GEMINI_INTERACTIONS_STREAM_UNSUPPORTED_CONTENT'
    | 'GENERATION_V2_GEMINI_INTERACTIONS_STREAM_MULTI_IMAGE_UNSUPPORTED'
    | 'GENERATION_V2_GEMINI_INTERACTIONS_STREAM_PROVIDER_FAILED'
    | 'GENERATION_V2_GEMINI_INTERACTIONS_STREAM_TERMINAL_INVALID') {
    super(code)
    this.name = 'GeminiInteractionsImageStreamV1Error'
  }
}

export type GeminiInteractionsImageNativeEventV1 = Readonly<{
  eventType: 'interaction.created' | 'interaction.status_update' | 'step.start' | 'step.delta' |
    'step.stop' | 'interaction.completed' | 'error' | 'done'
  canonicalJson: string
  raw: Readonly<Record<string, unknown>> | null
}>
export type GeminiInteractionsReasoningDetailV1 = Readonly<{
  type: 'thought_summary'
  text: string
  thoughtSignature?: string
}> | Readonly<{
  type: 'thought_image'
  data: string
  mimeType: string
  thoughtSignature?: string
}>

export type GeminiInteractionsImageResultV1 = Readonly<{
  bytes: Uint8Array
  mime: string
  interactionId: string
  model: string
  text: string
  reasoningDetails: readonly GeminiInteractionsReasoningDetailV1[]
  usage: Readonly<Record<string, unknown>>
  events: readonly GeminiInteractionsImageNativeEventV1[]
}>

function fail(code: GeminiInteractionsImageStreamV1Error['code']): never {
  throw new GeminiInteractionsImageStreamV1Error(code)
}
function record(value: unknown): Readonly<Record<string, unknown>> {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) {
    return fail('GENERATION_V2_GEMINI_INTERACTIONS_STREAM_INVALID_EVENT')
  }
  const descriptors = Object.getOwnPropertyDescriptors(value)
  if (Reflect.ownKeys(value).some((key) => typeof key !== 'string') ||
      Object.values(descriptors).some((descriptor) => !descriptor.enumerable || !('value' in descriptor) || descriptor.value === undefined)) {
    return fail('GENERATION_V2_GEMINI_INTERACTIONS_STREAM_INVALID_EVENT')
  }
  return value as Readonly<Record<string, unknown>>
}
function keys(value: Readonly<Record<string, unknown>>, required: readonly string[], optional: readonly string[] = []): void {
  const actual = Object.keys(value)
  if (required.some((key) => !actual.includes(key)) || actual.some((key) => !required.includes(key) && !optional.includes(key))) {
    fail('GENERATION_V2_GEMINI_INTERACTIONS_STREAM_INVALID_EVENT')
  }
}
function boundedString(value: unknown, max = 4096): string {
  if (typeof value !== 'string' || value.length < 1 || value.length > max || /\u0000/u.test(value)) {
    return fail('GENERATION_V2_GEMINI_INTERACTIONS_STREAM_INVALID_EVENT')
  }
  return value
}
function index(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0 || (value as number) > 1024) {
    return fail('GENERATION_V2_GEMINI_INTERACTIONS_STREAM_INVALID_EVENT')
  }
  return value as number
}
function canonicalRaw(raw: Readonly<Record<string, unknown>>): GeminiInteractionsImageNativeEventV1 {
  let canonicalJson: string
  try { canonicalJson = stableSerializeProviderRequestBoundedV2(raw, MAX_ARTIFACT_BYTES) } catch {
    return fail('GENERATION_V2_GEMINI_INTERACTIONS_STREAM_LIMIT_EXCEEDED')
  }
  const eventType = raw.event_type
  if (typeof eventType !== 'string') return fail('GENERATION_V2_GEMINI_INTERACTIONS_STREAM_INVALID_EVENT')
  return Object.freeze({ eventType: eventType as GeminiInteractionsImageNativeEventV1['eventType'], canonicalJson, raw })
}
function readInteraction(value: unknown, terminal: boolean): Readonly<Record<string, unknown>> {
  const interaction = record(value)
  keys(interaction, ['id', 'status'], ['agent', 'created', 'model', 'object', 'service_tier', 'steps', 'updated', 'usage'])
  boundedString(interaction.id, 4096)
  const expectedStatus = terminal ? 'completed' : 'in_progress'
  if (interaction.status !== expectedStatus || (interaction.model !== undefined &&
      (typeof interaction.model !== 'string' || !isGeminiInteractionsImageModelIdV1(interaction.model)))) {
    return fail('GENERATION_V2_GEMINI_INTERACTIONS_STREAM_TERMINAL_INVALID')
  }
  if (interaction.steps !== undefined && !Array.isArray(interaction.steps)) {
    return fail('GENERATION_V2_GEMINI_INTERACTIONS_STREAM_INVALID_EVENT')
  }
  if (interaction.usage !== undefined) record(interaction.usage)
  return interaction
}
function readImage(value: unknown): Readonly<{ data: string | null; mime: string | null }> {
  const image = record(value)
  if (image.type !== 'image') return fail('GENERATION_V2_GEMINI_INTERACTIONS_STREAM_UNSUPPORTED_CONTENT')
  keys(image, ['type'], ['data', 'mime_type', 'resolution', 'uri'])
  if (image.uri !== undefined || image.resolution !== undefined ||
      (image.data === undefined && image.mime_type === undefined)) {
    return fail('GENERATION_V2_GEMINI_INTERACTIONS_STREAM_UNSUPPORTED_CONTENT')
  }
  const data = image.data === undefined ? null : boundedString(image.data, MAX_STREAM_BYTES)
  const mime = image.mime_type === undefined ? null : boundedString(image.mime_type, 128).toLowerCase()
  if (mime !== null && !ALLOWED_IMAGE_MIMES.has(mime)) {
    return fail('GENERATION_V2_GEMINI_INTERACTIONS_STREAM_UNSUPPORTED_CONTENT')
  }
  return Object.freeze({ data, mime })
}
function readText(value: unknown): string {
  const text = record(value)
  if (text.type !== 'output_text' && text.type !== 'text_output') {
    return fail('GENERATION_V2_GEMINI_INTERACTIONS_STREAM_UNSUPPORTED_CONTENT')
  }
  keys(text, ['type', 'text'])
  return typeof text.text === 'string' ? text.text : fail('GENERATION_V2_GEMINI_INTERACTIONS_STREAM_INVALID_EVENT')
}
function readThoughtSummary(value: unknown): GeminiInteractionsReasoningDetailV1 {
  const thought = record(value)
  if (thought.type !== 'thought_summary' && thought.type !== 'thinking_summary' && thought.type !== 'reasoning_summary') {
    return fail('GENERATION_V2_GEMINI_INTERACTIONS_STREAM_UNSUPPORTED_CONTENT')
  }
  keys(thought, ['type'], ['text', 'content', 'thought_signature'])
  if ((thought.text === undefined) === (thought.content === undefined) ||
      (thought.thought_signature !== undefined && typeof thought.thought_signature !== 'string')) {
    return fail('GENERATION_V2_GEMINI_INTERACTIONS_STREAM_INVALID_EVENT')
  }
  const signature = thought.thought_signature === undefined ? {} : { thoughtSignature: thought.thought_signature as string }
  if (thought.text !== undefined) {
    if (typeof thought.text !== 'string') return fail('GENERATION_V2_GEMINI_INTERACTIONS_STREAM_INVALID_EVENT')
    return Object.freeze({ type: 'thought_summary' as const, text: thought.text, ...signature })
  }
  const content = record(thought.content)
  if (content.type === 'text') {
    keys(content, ['type', 'text'])
    if (typeof content.text !== 'string') return fail('GENERATION_V2_GEMINI_INTERACTIONS_STREAM_INVALID_EVENT')
    return Object.freeze({ type: 'thought_summary' as const, text: content.text, ...signature })
  }
  const image = readImage(content)
  if (image.data === null || image.mime === null) return fail('GENERATION_V2_GEMINI_INTERACTIONS_STREAM_INVALID_EVENT')
  return Object.freeze({ type: 'thought_image' as const, data: image.data, mimeType: image.mime, ...signature })
}
function readOutput(value: unknown): Readonly<{ kind: 'image'; value: ReturnType<typeof readImage> }> |
  Readonly<{ kind: 'text'; value: string }> | Readonly<{ kind: 'thought'; value: ReturnType<typeof readThoughtSummary> }> {
  const output = record(value)
  return output.type === 'image'
    ? Object.freeze({ kind: 'image' as const, value: readImage(output) })
    : output.type === 'output_text' || output.type === 'text_output'
      ? Object.freeze({ kind: 'text' as const, value: readText(output) })
      : Object.freeze({ kind: 'thought' as const, value: readThoughtSummary(output) })
}

function parseJsonEvent(rawText: string): GeminiInteractionsImageNativeEventV1 {
  let parsed: unknown
  try { parsed = JSON.parse(rawText) } catch { return fail('GENERATION_V2_GEMINI_INTERACTIONS_STREAM_INVALID_SSE') }
  const raw = record(parsed)
  switch (raw.event_type) {
    case 'interaction.created':
      keys(raw, ['event_type', 'interaction'], ['event_id', 'metadata'])
      readInteraction(raw.interaction, false)
      break
    case 'interaction.status_update':
      keys(raw, ['event_type', 'interaction_id', 'status'], ['event_id', 'metadata'])
      boundedString(raw.interaction_id, 4096)
      if (!['in_progress', 'requires_action', 'completed', 'failed', 'cancelled', 'incomplete', 'budget_exceeded'].includes(raw.status as string)) {
        return fail('GENERATION_V2_GEMINI_INTERACTIONS_STREAM_INVALID_EVENT')
      }
      break
    case 'step.start': {
      keys(raw, ['event_type', 'index', 'step'], ['event_id', 'metadata'])
      index(raw.index)
      const step = record(raw.step)
      keys(step, ['type'], ['content', 'error'])
      if ((step.type !== 'model_output' && step.type !== 'thought') || step.error !== undefined) return fail('GENERATION_V2_GEMINI_INTERACTIONS_STREAM_UNSUPPORTED_CONTENT')
      if (step.content !== undefined) {
        if (!Array.isArray(step.content) || step.content.length > 2 ||
            step.content.filter((content) => record(content).type === 'image').length > 1) {
          return fail('GENERATION_V2_GEMINI_INTERACTIONS_STREAM_MULTI_IMAGE_UNSUPPORTED')
        }
        for (const content of step.content) readOutput(content)
      }
      break
    }
    case 'step.delta':
      keys(raw, ['event_type', 'index', 'delta'], ['event_id', 'metadata'])
      index(raw.index); readOutput(raw.delta)
      break
    case 'step.stop':
      keys(raw, ['event_type', 'index'], ['event_id', 'metadata', 'step_usage', 'usage'])
      index(raw.index)
      if (raw.step_usage !== undefined) record(raw.step_usage)
      if (raw.usage !== undefined) record(raw.usage)
      break
    case 'interaction.completed':
      keys(raw, ['event_type', 'interaction'], ['event_id', 'metadata'])
      readInteraction(raw.interaction, true)
      break
    case 'error':
      keys(raw, ['event_type'], ['event_id', 'metadata', 'error'])
      if (raw.error !== undefined) {
        const error = record(raw.error)
        keys(error, [], ['code', 'message'])
        if (error.code !== undefined) boundedString(error.code, 1024)
        if (error.message !== undefined) boundedString(error.message, 4096)
      }
      break
    default:
      return fail('GENERATION_V2_GEMINI_INTERACTIONS_STREAM_INVALID_EVENT')
  }
  return canonicalRaw(raw)
}

export class GeminiInteractionsImageSseDecoderV1 {
  readonly #decoder = new TextDecoder('utf-8', { fatal: true })
  #buffer = ''
  #wireBytes = 0
  #doneSeen = false
  #finished = false

  push(bytes: Uint8Array): readonly GeminiInteractionsImageNativeEventV1[] {
    if (this.#finished || !ArrayBuffer.isView(bytes) || bytes instanceof DataView ||
        Object.prototype.toString.call(bytes) !== '[object Uint8Array]') return fail('GENERATION_V2_GEMINI_INTERACTIONS_STREAM_INVALID_SSE')
    this.#wireBytes += bytes.byteLength
    if (this.#wireBytes > MAX_STREAM_BYTES) return fail('GENERATION_V2_GEMINI_INTERACTIONS_STREAM_LIMIT_EXCEEDED')
    try { this.#buffer += this.#decoder.decode(bytes, { stream: true }) } catch {
      return fail('GENERATION_V2_GEMINI_INTERACTIONS_STREAM_INVALID_SSE')
    }
    return this.#drain(false)
  }
  finish(): readonly GeminiInteractionsImageNativeEventV1[] {
    if (this.#finished) return fail('GENERATION_V2_GEMINI_INTERACTIONS_STREAM_INVALID_SSE')
    this.#finished = true
    try { this.#buffer += this.#decoder.decode() } catch { return fail('GENERATION_V2_GEMINI_INTERACTIONS_STREAM_INVALID_SSE') }
    const events = this.#drain(true)
    if (this.#buffer.length !== 0 || !this.#doneSeen) return fail('GENERATION_V2_GEMINI_INTERACTIONS_STREAM_TERMINAL_INVALID')
    return events
  }
  #drain(final: boolean): readonly GeminiInteractionsImageNativeEventV1[] {
    const events: GeminiInteractionsImageNativeEventV1[] = []
    while (true) {
      const match = /\r?\n\r?\n/u.exec(this.#buffer)
      if (!match || match.index === undefined) break
      const frame = this.#buffer.slice(0, match.index)
      this.#buffer = this.#buffer.slice(match.index + match[0].length)
      if (Buffer.byteLength(frame, 'utf8') > MAX_FRAME_BYTES || this.#doneSeen) return fail('GENERATION_V2_GEMINI_INTERACTIONS_STREAM_INVALID_SSE')
      const data: string[] = []
      for (const line of frame.split(/\r?\n/u)) {
        if (line === 'data' || line.startsWith('data:')) data.push(line === 'data' ? '' : line.slice(5).replace(/^ /u, ''))
        else if (line.length !== 0 && !line.startsWith(':')) return fail('GENERATION_V2_GEMINI_INTERACTIONS_STREAM_INVALID_SSE')
      }
      if (data.length === 0) return fail('GENERATION_V2_GEMINI_INTERACTIONS_STREAM_INVALID_SSE')
      const joined = data.join('\n')
      if (joined === '[DONE]') {
        this.#doneSeen = true
        events.push(Object.freeze({ eventType: 'done', canonicalJson: '{"event_type":"done"}', raw: null }))
      } else events.push(parseJsonEvent(joined))
    }
    if (final && this.#buffer.trim().length === 0) this.#buffer = ''
    return Object.freeze(events)
  }
}

export class GeminiInteractionsImageResultAssemblerV1 {
  readonly #expectedModel!: string
  #events: GeminiInteractionsImageNativeEventV1[] = []
  #createdId: string | null = null
  #activeStep: number | null = null
  #activeStepType: 'model_output' | 'thought' | null = null
  #chunks: string[] = []
  #textChunks: string[] = []
  #reasoningDetails: GeminiInteractionsReasoningDetailV1[] = []
  #mime: string | null = null
  #completed: Readonly<Record<string, unknown>> | null = null
  #done = false
  #failed = false
  #finished = false

  constructor(expectedModel = 'gemini-3.1-flash-image') {
    if (!isGeminiInteractionsImageModelIdV1(expectedModel)) return fail('GENERATION_V2_GEMINI_INTERACTIONS_STREAM_TERMINAL_INVALID')
    this.#expectedModel = expectedModel
  }

  push(event: GeminiInteractionsImageNativeEventV1): void {
    if (this.#finished || this.#done) return fail('GENERATION_V2_GEMINI_INTERACTIONS_STREAM_TERMINAL_INVALID')
    this.#events.push(event)
    if (event.eventType === 'done') { this.#done = true; return }
    const raw = event.raw!
    if (event.eventType === 'error') { this.#failed = true; return }
    if (event.eventType === 'interaction.created') {
      if (this.#createdId !== null || this.#activeStep !== null || this.#completed !== null) return fail('GENERATION_V2_GEMINI_INTERACTIONS_STREAM_TERMINAL_INVALID')
      this.#createdId = boundedString(record(raw.interaction).id, 4096)
      return
    }
    if (this.#createdId === null) return fail('GENERATION_V2_GEMINI_INTERACTIONS_STREAM_TERMINAL_INVALID')
    if (event.eventType === 'step.start') {
      if (this.#activeStep !== null || this.#completed !== null) return fail('GENERATION_V2_GEMINI_INTERACTIONS_STREAM_TERMINAL_INVALID')
      this.#activeStep = index(raw.index)
      const step = record(raw.step)
      this.#activeStepType = step.type as 'model_output' | 'thought'
      const content = step.content
      if (Array.isArray(content)) for (const item of content) {
        const output = readOutput(item)
        if (this.#activeStepType === 'thought' && output.kind !== 'thought') {
          return fail('GENERATION_V2_GEMINI_INTERACTIONS_STREAM_UNSUPPORTED_CONTENT')
        }
        this.#appendOutput(output)
      }
      return
    }
    if (event.eventType === 'step.delta') {
      if (this.#activeStep === null || index(raw.index) !== this.#activeStep) return fail('GENERATION_V2_GEMINI_INTERACTIONS_STREAM_TERMINAL_INVALID')
      const output = readOutput(raw.delta)
      if (this.#activeStepType === 'thought' && output.kind !== 'thought') {
        return fail('GENERATION_V2_GEMINI_INTERACTIONS_STREAM_UNSUPPORTED_CONTENT')
      }
      this.#appendOutput(output); return
    }
    if (event.eventType === 'step.stop') {
      if (this.#activeStep === null || index(raw.index) !== this.#activeStep) return fail('GENERATION_V2_GEMINI_INTERACTIONS_STREAM_TERMINAL_INVALID')
      this.#activeStep = null; this.#activeStepType = null; return
    }
    if (event.eventType === 'interaction.completed') {
      if (this.#activeStep !== null || this.#completed !== null) return fail('GENERATION_V2_GEMINI_INTERACTIONS_STREAM_TERMINAL_INVALID')
      const interaction = readInteraction(raw.interaction, true)
      if (interaction.id !== this.#createdId) return fail('GENERATION_V2_GEMINI_INTERACTIONS_STREAM_TERMINAL_INVALID')
      this.#completed = interaction
    }
  }
  #append(image: Readonly<{ data: string | null; mime: string | null }>): void {
    if (image.mime !== null) {
      if (this.#mime !== null && this.#mime !== image.mime) return fail('GENERATION_V2_GEMINI_INTERACTIONS_STREAM_INVALID_EVENT')
      this.#mime = image.mime
    }
    if (image.data !== null) this.#chunks.push(image.data)
  }
  #appendOutput(output: ReturnType<typeof readOutput>): void {
    if (output.kind === 'image') this.#append(output.value)
    else if (output.kind === 'text') this.#textChunks.push(output.value)
    else this.#reasoningDetails.push(output.value)
  }
  finish(): GeminiInteractionsImageResultV1 {
    if (this.#finished || !this.#done || this.#failed || this.#activeStep !== null || !this.#completed ||
        this.#chunks.length === 0 || this.#mime === null || this.#completed.model !== this.#expectedModel) {
      return fail(this.#failed ? 'GENERATION_V2_GEMINI_INTERACTIONS_STREAM_PROVIDER_FAILED'
        : 'GENERATION_V2_GEMINI_INTERACTIONS_STREAM_TERMINAL_INVALID')
    }
    this.#finished = true
    const encoded = this.#chunks.join('')
    if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(encoded)) {
      return fail('GENERATION_V2_GEMINI_INTERACTIONS_STREAM_INVALID_EVENT')
    }
    const bytes = Buffer.from(encoded, 'base64')
    if (bytes.length === 0 || bytes.length > MAX_STREAM_BYTES || bytes.toString('base64') !== encoded) {
      return fail('GENERATION_V2_GEMINI_INTERACTIONS_STREAM_INVALID_EVENT')
    }
    return Object.freeze({ bytes: new Uint8Array(bytes), mime: this.#mime,
      interactionId: this.#createdId!, model: this.#expectedModel, text: this.#textChunks.join(''),
      reasoningDetails: Object.freeze([...this.#reasoningDetails]),
      usage: this.#completed.usage === undefined ? Object.freeze({}) : record(this.#completed.usage),
      events: Object.freeze([...this.#events]) })
  }
}

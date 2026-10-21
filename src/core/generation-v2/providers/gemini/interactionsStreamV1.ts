import { decodeBase64Bytes, encodeBase64Bytes, utf8ByteLength } from '@/shared/encoding/binaryEncoding'
import { stableSerializeProviderRequestBoundedV2 } from '../../compiler/stableSerialize'
import {
  GENERATION_NATIVE_ARTIFACT_MAX_BYTES_V1,
  GENERATION_SUCCESS_RESPONSE_MAX_BYTES_V1,
} from '../../capacity/generationCapacityV1'

const MAX_STREAM_BYTES = GENERATION_SUCCESS_RESPONSE_MAX_BYTES_V1
const MAX_FRAME_BYTES = 24 * 1024 * 1024
const MAX_ARTIFACT_BYTES = GENERATION_NATIVE_ARTIFACT_MAX_BYTES_V1
const ALLOWED_IMAGE_MIMES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/heic', 'image/heif', 'image/gif', 'image/bmp', 'image/tiff'])

type GeminiInteractionsDiagnosticStageV1 = 'frame_decode' | 'event_assembly' | 'stream_finish'
type GeminiInteractionsDiagnosticContextV1 = Readonly<Record<string, string | number | boolean | null>>
type GeminiInteractionsDiagnosticReasonV1 = 'invalid_record' | 'invalid_record_property' | 'missing_required_field' |
  'unexpected_field' | 'invalid_string' | 'invalid_index' | 'invalid_array' | 'invalid_array_item' |
  'invalid_thought_summary' | 'invalid_error_code' | 'invalid_value' | 'invalid_base64' |
  'invalid_image_bytes' | 'stream_incomplete_or_invalid' | 'image_mime_conflict'

export class GeminiInteractionsImageStreamV1Error extends Error {
  constructor(readonly code:
    | 'GENERATION_V2_GEMINI_INTERACTIONS_STREAM_INVALID_SSE'
    | 'GENERATION_V2_GEMINI_INTERACTIONS_STREAM_INVALID_EVENT'
    | 'GENERATION_V2_GEMINI_INTERACTIONS_STREAM_EVENT_MISMATCH'
    | 'GENERATION_V2_GEMINI_INTERACTIONS_STREAM_MISSING_EVENT'
    | 'GENERATION_V2_GEMINI_INTERACTIONS_STREAM_LIMIT_EXCEEDED'
    | 'GENERATION_V2_GEMINI_INTERACTIONS_STREAM_UNSUPPORTED_CONTENT'
    | 'GENERATION_V2_GEMINI_INTERACTIONS_STREAM_UNSUPPORTED_SERVER_TOOL_STEP'
    | 'GENERATION_V2_GEMINI_INTERACTIONS_STREAM_MULTI_IMAGE_UNSUPPORTED'
    | 'GENERATION_V2_GEMINI_INTERACTIONS_STREAM_PROVIDER_FAILED'
    | 'GENERATION_V2_GEMINI_INTERACTIONS_STREAM_TERMINAL_INVALID',
    readonly rawEvent: Readonly<Record<string, unknown>> | null = null,
    readonly eventType: string | null = null,
    readonly stepType: string | null = null,
    readonly providerError: Readonly<Record<string, unknown>> | null = null,
    readonly rawFrameExcerpt: string | null = null,
    readonly diagnosticStage: GeminiInteractionsDiagnosticStageV1 | null = null,
    readonly fieldPath: string | null = null,
    readonly diagnosticReason: GeminiInteractionsDiagnosticReasonV1 | null = null,
    readonly diagnosticContext: GeminiInteractionsDiagnosticContextV1 | null = null) {
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
}> | Readonly<{
  type: 'thought_signature'
  signature: string
}>

export type GeminiInteractionsSearchEvidenceV1 = Readonly<{
  events: readonly Readonly<{
    eventType: 'step.start' | 'step.delta' | 'step.stop' | 'interaction.completed'
    stepIndex: number
    stepType: 'google_search_call' | 'google_search_result'
    canonicalJson: string
    raw: Readonly<Record<string, unknown>>
  }>[]
  calls: readonly Readonly<{
    stepIndex: number
    id: string
    arguments: unknown
    signature: string | null
  }>[]
  results: readonly Readonly<{
    stepIndex: number
    callId: string
    result: unknown
    isError: boolean | null
    searchSuggestions: string | null
    signature: string | null
  }>[]
  annotations: readonly Readonly<Record<string, unknown>>[]
}>

export type GeminiInteractionsImageResultV1 = Readonly<{
  bytes: Uint8Array
  mime: string
  interactionId: string | null
  model: string
  text: string
  reasoningDetails: readonly GeminiInteractionsReasoningDetailV1[]
  usage: Readonly<Record<string, unknown>>
  events: readonly GeminiInteractionsImageNativeEventV1[]
  searchEvidence: GeminiInteractionsSearchEvidenceV1
}>

function fail(code: GeminiInteractionsImageStreamV1Error['code'], rawEvent: Readonly<Record<string, unknown>> | null = null,
  eventType: string | null = null, stepType: string | null = null,
  providerError: Readonly<Record<string, unknown>> | null = null,
  rawFrameExcerpt: string | null = null,
  diagnostic: Readonly<{ fieldPath?: string | null; reason?: GeminiInteractionsDiagnosticReasonV1 | null;
    context?: GeminiInteractionsDiagnosticContextV1 | null }> = {}): never {
  throw new GeminiInteractionsImageStreamV1Error(code, rawEvent, eventType, stepType, providerError, rawFrameExcerpt,
    null, diagnostic.fieldPath ?? null, diagnostic.reason ?? null, diagnostic.context ?? null)
}
function childPath(base: string | null | undefined, child: string): string {
  return base ? `${base}.${child}` : child
}
function boundedFieldPath(path: string | null): string | null {
  if (path === null || path.length === 0) return null
  return /^[A-Za-z0-9_.\[\]-]{1,192}$/u.test(path) ? path : null
}
function record(value: unknown, path: string | null = null): Readonly<Record<string, unknown>> {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)) {
    return fail('GENERATION_V2_GEMINI_INTERACTIONS_STREAM_INVALID_EVENT', null, null, null, null, null,
      { fieldPath: boundedFieldPath(path), reason: 'invalid_record' })
  }
  const descriptors = Object.getOwnPropertyDescriptors(value)
  if (Reflect.ownKeys(value).some((key) => typeof key !== 'string') ||
      Object.values(descriptors).some((descriptor) => !descriptor.enumerable || !('value' in descriptor) || descriptor.value === undefined)) {
    return fail('GENERATION_V2_GEMINI_INTERACTIONS_STREAM_INVALID_EVENT', null, null, null, null, null,
      { fieldPath: boundedFieldPath(path), reason: 'invalid_record_property' })
  }
  return value as Readonly<Record<string, unknown>>
}
function keys(value: Readonly<Record<string, unknown>>, required: readonly string[], optional: readonly string[] = [],
  path = ''): void {
  const actual = Object.keys(value)
  const missing = required.find((key) => !actual.includes(key))
  if (missing !== undefined) fail('GENERATION_V2_GEMINI_INTERACTIONS_STREAM_INVALID_EVENT', null, null, null, null, null,
    { fieldPath: boundedFieldPath(childPath(path, missing)), reason: 'missing_required_field' })
  const extra = actual.find((key) => !required.includes(key) && !optional.includes(key))
  if (extra !== undefined) fail('GENERATION_V2_GEMINI_INTERACTIONS_STREAM_INVALID_EVENT', null, null, null, null, null,
    { fieldPath: boundedFieldPath(childPath(path, extra)), reason: 'unexpected_field' })
}
function boundedString(value: unknown, max = 4096, path: string | null = null): string {
  if (typeof value !== 'string' || value.length < 1 || value.length > max || /\u0000/u.test(value)) {
    return fail('GENERATION_V2_GEMINI_INTERACTIONS_STREAM_INVALID_EVENT', null, null, null, null, null,
      { fieldPath: boundedFieldPath(path), reason: 'invalid_string' })
  }
  return value
}
function index(value: unknown, path = 'index'): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0 || (value as number) > 1024) {
    return fail('GENERATION_V2_GEMINI_INTERACTIONS_STREAM_INVALID_EVENT', null, null, null, null, null,
      { fieldPath: boundedFieldPath(path), reason: 'invalid_index' })
  }
  return value as number
}
type GeminiInteractionsEventTypeV1 = Exclude<GeminiInteractionsImageNativeEventV1['eventType'], 'done'>
const KNOWN_EVENT_TYPES = new Set<GeminiInteractionsEventTypeV1>([
  'interaction.created', 'interaction.status_update', 'step.start', 'step.delta',
  'step.stop', 'interaction.completed', 'error',
])
function isKnownEventType(value: unknown): value is GeminiInteractionsEventTypeV1 {
  return typeof value === 'string' && KNOWN_EVENT_TYPES.has(value as GeminiInteractionsEventTypeV1)
}
function canonicalRaw(raw: Readonly<Record<string, unknown>>, eventType: GeminiInteractionsEventTypeV1): GeminiInteractionsImageNativeEventV1 {
  let canonicalJson: string
  try { canonicalJson = stableSerializeProviderRequestBoundedV2(raw, MAX_ARTIFACT_BYTES) } catch {
    return fail('GENERATION_V2_GEMINI_INTERACTIONS_STREAM_LIMIT_EXCEEDED')
  }
  return Object.freeze({ eventType: eventType as GeminiInteractionsImageNativeEventV1['eventType'], canonicalJson, raw })
}
function readInteraction(value: unknown, terminal: boolean, path = 'interaction', allowMissingId = false,
  allowMissingStatus = false): Readonly<Record<string, unknown>> {
  const interaction = record(value, path)
  keys(interaction, [
    ...(allowMissingId ? [] : ['id']),
    ...(allowMissingStatus ? [] : ['status']),
  ], [
    'agent', 'created', 'model', 'object', 'service_tier', 'steps', 'updated', 'usage', 'continuation_token',
    ...(allowMissingId ? ['id'] : []),
    ...(allowMissingStatus ? ['status'] : []),
  ], path)
  if (interaction.continuation_token !== undefined) boundedString(interaction.continuation_token, 4096, childPath(path, 'continuation_token'))
  if ((interaction.id !== undefined && interaction.id !== '') || !allowMissingId) boundedString(interaction.id, 4096, childPath(path, 'id'))
  const expectedStatus = terminal ? 'completed' : 'in_progress'
  if ((interaction.status !== undefined ? interaction.status !== expectedStatus : !allowMissingStatus) || (interaction.model !== undefined &&
      (typeof interaction.model !== 'string' || interaction.model.length < 1))) {
    return fail('GENERATION_V2_GEMINI_INTERACTIONS_STREAM_TERMINAL_INVALID')
  }
  if (interaction.steps !== undefined && !Array.isArray(interaction.steps)) {
    return fail('GENERATION_V2_GEMINI_INTERACTIONS_STREAM_INVALID_EVENT', null, null, null, null, null,
      { fieldPath: childPath(path, 'steps'), reason: 'invalid_array' })
  }
  if (interaction.usage !== undefined) record(interaction.usage, childPath(path, 'usage'))
  return interaction
}
function readImage(value: unknown, path = 'image'): Readonly<{ data: string | null; mime: string | null }> {
  const image = record(value, path)
  if (image.type !== 'image') return fail('GENERATION_V2_GEMINI_INTERACTIONS_STREAM_UNSUPPORTED_CONTENT')
  keys(image, ['type'], ['data', 'mime_type', 'resolution', 'uri'], path)
  if (image.uri !== undefined || image.resolution !== undefined ||
      (image.data === undefined && image.mime_type === undefined)) {
    return fail('GENERATION_V2_GEMINI_INTERACTIONS_STREAM_UNSUPPORTED_CONTENT')
  }
  const data = image.data === undefined ? null : boundedString(image.data, MAX_STREAM_BYTES, childPath(path, 'data'))
  const mime = image.mime_type === undefined ? null : boundedString(image.mime_type, 128, childPath(path, 'mime_type')).toLowerCase()
  if (mime !== null && !ALLOWED_IMAGE_MIMES.has(mime)) {
    return fail('GENERATION_V2_GEMINI_INTERACTIONS_STREAM_UNSUPPORTED_CONTENT')
  }
  return Object.freeze({ data, mime })
}
function readText(value: unknown, path = 'text'): Readonly<{ text: string; annotations: readonly Readonly<Record<string, unknown>>[] }> {
  const text = record(value, path)
  if (text.type !== 'text' && text.type !== 'output_text' && text.type !== 'text_output') {
    return fail('GENERATION_V2_GEMINI_INTERACTIONS_STREAM_UNSUPPORTED_CONTENT')
  }
  keys(text, ['type', 'text'], ['annotations'], path)
  if (typeof text.text !== 'string') return fail('GENERATION_V2_GEMINI_INTERACTIONS_STREAM_INVALID_EVENT', null, null, null, null, null,
    { fieldPath: childPath(path, 'text'), reason: 'invalid_string' })
  if (text.annotations !== undefined) {
    if (!Array.isArray(text.annotations)) return fail('GENERATION_V2_GEMINI_INTERACTIONS_STREAM_INVALID_EVENT', null, null, null, null, null,
      { fieldPath: childPath(path, 'annotations'), reason: 'invalid_array' })
    for (const [annotationIndex, item] of text.annotations.entries()) {
      const annotationPath = `${path}.annotations[${annotationIndex}]`
      record(item, annotationPath)
      try { stableSerializeProviderRequestBoundedV2(item, 1024 * 1024) } catch {
        return fail('GENERATION_V2_GEMINI_INTERACTIONS_STREAM_INVALID_EVENT', null, null, null, null, null,
          { fieldPath: annotationPath, reason: 'invalid_value' })
      }
    }
  }
  return Object.freeze({ text: text.text, annotations: Object.freeze((text.annotations ?? []) as Readonly<Record<string, unknown>>[]) })
}
function readThoughtSignature(value: unknown, path = 'thought'): GeminiInteractionsReasoningDetailV1 {
  const thought = record(value, path)
  if (thought.type !== 'thought_signature') return fail('GENERATION_V2_GEMINI_INTERACTIONS_STREAM_UNSUPPORTED_CONTENT')
  keys(thought, ['type', 'signature'], [], path)
  return Object.freeze({ type: 'thought_signature' as const,
    signature: boundedString(thought.signature, MAX_STREAM_BYTES, childPath(path, 'signature')) })
}
function readThoughtSummary(value: unknown, path = 'thought'): GeminiInteractionsReasoningDetailV1 {
  const thought = record(value, path)
  if (thought.type !== 'thought_summary' && thought.type !== 'thinking_summary' && thought.type !== 'reasoning_summary') {
    return fail('GENERATION_V2_GEMINI_INTERACTIONS_STREAM_UNSUPPORTED_CONTENT')
  }
  keys(thought, ['type'], ['text', 'content', 'thought_signature'], path)
  if ((thought.text === undefined) === (thought.content === undefined)) {
    return fail('GENERATION_V2_GEMINI_INTERACTIONS_STREAM_INVALID_EVENT', null, null, null, null, null,
      { fieldPath: path, reason: 'invalid_value' })
  }
  if (thought.thought_signature !== undefined && typeof thought.thought_signature !== 'string') {
    return fail('GENERATION_V2_GEMINI_INTERACTIONS_STREAM_INVALID_EVENT', null, null, null, null, null,
      { fieldPath: childPath(path, 'thought_signature'), reason: 'invalid_string' })
  }
  const signature = thought.thought_signature === undefined ? {} : { thoughtSignature: thought.thought_signature as string }
  if (thought.text !== undefined) {
    if (typeof thought.text !== 'string') return fail('GENERATION_V2_GEMINI_INTERACTIONS_STREAM_INVALID_EVENT', null, null, null, null, null,
      { fieldPath: childPath(path, 'text'), reason: 'invalid_string' })
    return Object.freeze({ type: 'thought_summary' as const, text: thought.text, ...signature })
  }
  const content = record(thought.content, childPath(path, 'content'))
  if (content.type === 'text') {
    keys(content, ['type', 'text'], [], childPath(path, 'content'))
    if (typeof content.text !== 'string') return fail('GENERATION_V2_GEMINI_INTERACTIONS_STREAM_INVALID_EVENT', null, null, null, null, null,
      { fieldPath: childPath(path, 'content.text'), reason: 'invalid_string' })
    return Object.freeze({ type: 'thought_summary' as const, text: content.text, ...signature })
  }
  const image = readImage(content, childPath(path, 'content'))
  if (image.data === null || image.mime === null) return fail('GENERATION_V2_GEMINI_INTERACTIONS_STREAM_INVALID_EVENT', null, null, null, null, null,
    { fieldPath: childPath(path, image.data === null ? 'content.data' : 'content.mime_type'), reason: 'missing_required_field' })
  return Object.freeze({ type: 'thought_image' as const, data: image.data, mimeType: image.mime, ...signature })
}
function readOutput(value: unknown, path = 'output'): Readonly<{ kind: 'image'; value: ReturnType<typeof readImage> }> |
  Readonly<{ kind: 'text'; value: string; annotations: readonly Readonly<Record<string, unknown>>[] }> |
  Readonly<{ kind: 'thought'; value: ReturnType<typeof readThoughtSummary> }> {
  const output = record(value, path)
  if (output.type === 'text' || output.type === 'output_text' || output.type === 'text_output') {
    const text = readText(output, path)
    return Object.freeze({ kind: 'text' as const, value: text.text, annotations: text.annotations })
  }
  if (output.type === 'text_annotation_delta') {
    keys(output, ['type', 'annotations'], [], path)
    if (!Array.isArray(output.annotations)) return fail('GENERATION_V2_GEMINI_INTERACTIONS_STREAM_INVALID_EVENT', null, null, null, null, null,
      { fieldPath: childPath(path, 'annotations'), reason: 'invalid_array' })
    const annotations = output.annotations.map((annotation, index) => {
      const value = record(annotation, `${path}.annotations[${index}]`)
      stableSerializeProviderRequestBoundedV2(value, 1024 * 1024)
      return value
    })
    return Object.freeze({ kind: 'text' as const, value: '', annotations: Object.freeze(annotations) })
  }
  return output.type === 'image'
    ? Object.freeze({ kind: 'image' as const, value: readImage(output, path) })
    : output.type === 'thought_signature'
        ? Object.freeze({ kind: 'thought' as const, value: readThoughtSignature(output, path) })
      : Object.freeze({ kind: 'thought' as const, value: readThoughtSummary(output, path) })
}

type GeminiInteractionsSearchStepTypeV1 = 'google_search_call' | 'google_search_result'
function searchStepType(value: unknown): GeminiInteractionsSearchStepTypeV1 | null {
  return value === 'google_search_call' || value === 'google_search_result' ? value : null
}
function validateSearchStep(value: unknown, rawEvent: Readonly<Record<string, unknown>>, eventType: string,
  path = 'step'): GeminiInteractionsSearchStepTypeV1 {
  const step = record(value, path)
  const type = searchStepType(step.type)
  if (type === null) {
    const stepType = typeof step.type === 'string' ? step.type : null
    return fail('GENERATION_V2_GEMINI_INTERACTIONS_STREAM_UNSUPPORTED_SERVER_TOOL_STEP', rawEvent, eventType, stepType)
  }
  try { stableSerializeProviderRequestBoundedV2(step, MAX_ARTIFACT_BYTES) } catch {
    return fail('GENERATION_V2_GEMINI_INTERACTIONS_STREAM_LIMIT_EXCEEDED', rawEvent, eventType, type)
  }
  return type
}

function parseJsonEvent(rawText: string, sseEvent: string | null): GeminiInteractionsImageNativeEventV1 {
  let parsed: unknown
  try { parsed = JSON.parse(rawText) } catch { return fail('GENERATION_V2_GEMINI_INTERACTIONS_STREAM_INVALID_SSE') }
  const raw = record(parsed)
  const payloadEvent = typeof raw.event_type === 'string'
    ? raw.event_type
    : typeof raw.type === 'string' && isKnownEventType(raw.type) ? raw.type : null
  if (sseEvent !== null && payloadEvent !== null && sseEvent !== payloadEvent) {
    return fail('GENERATION_V2_GEMINI_INTERACTIONS_STREAM_EVENT_MISMATCH')
  }
  const eventType = sseEvent ?? payloadEvent
  if (!isKnownEventType(eventType)) return fail('GENERATION_V2_GEMINI_INTERACTIONS_STREAM_MISSING_EVENT')
  switch (eventType) {
    case 'interaction.created':
      keys(raw, ['interaction'], ['event_type', 'type', 'event_id', 'metadata'])
      readInteraction(raw.interaction, false, 'interaction', true, true)
      break
    case 'interaction.status_update':
      keys(raw, ['status'], ['event_type', 'type', 'event_id', 'metadata', 'interaction_id'])
      if (raw.interaction_id !== undefined && raw.interaction_id !== '') boundedString(raw.interaction_id, 4096, 'interaction_id')
      if (!['in_progress', 'requires_action', 'completed', 'failed', 'cancelled', 'incomplete', 'budget_exceeded'].includes(raw.status as string)) {
        return fail('GENERATION_V2_GEMINI_INTERACTIONS_STREAM_INVALID_EVENT')
      }
      break
    case 'step.start': {
      keys(raw, ['index', 'step'], ['event_type', 'type', 'event_id', 'metadata'])
      index(raw.index, 'index')
      const step = record(raw.step, 'step')
      const stepType = typeof step.type === 'string' ? step.type : null
      if (stepType !== 'model_output' && stepType !== 'thought') {
        validateSearchStep(step, raw, eventType)
      }
      if (step.content !== undefined) {
        if (!Array.isArray(step.content) || step.content.length > 2 ||
            step.content.filter((content, index) => record(content, `step.content[${index}]`).type === 'image').length > 1) {
          return fail('GENERATION_V2_GEMINI_INTERACTIONS_STREAM_MULTI_IMAGE_UNSUPPORTED')
        }
        for (const [index, content] of step.content.entries()) readOutput(content, `step.content[${index}]`)
      }
      break
    }
    case 'step.delta':
      keys(raw, ['index', 'delta'], ['event_type', 'type', 'event_id', 'metadata'])
      index(raw.index, 'index')
      const delta = record(raw.delta, 'delta')
      if (delta.type !== 'image' && delta.type !== 'text' && delta.type !== 'output_text' && delta.type !== 'text_annotation_delta' &&
          delta.type !== 'text_output' && delta.type !== 'thought_signature' && delta.type !== 'thought_summary' &&
          delta.type !== 'thinking_summary' && delta.type !== 'reasoning_summary') {
          validateSearchStep(delta, raw, eventType, 'delta')
      } else readOutput(delta, 'delta')
      break
    case 'step.stop':
      keys(raw, ['index'], ['event_type', 'type', 'event_id', 'metadata', 'step_usage', 'usage'])
      index(raw.index, 'index')
      if (raw.step_usage !== undefined) record(raw.step_usage, 'step_usage')
      if (raw.usage !== undefined) record(raw.usage, 'usage')
      break
    case 'interaction.completed':
      keys(raw, ['interaction'], ['event_type', 'type', 'event_id', 'metadata'])
      readInteraction(raw.interaction, true, 'interaction', true)
      break
    case 'error':
      keys(raw, [], ['event_type', 'type', 'event_id', 'metadata', 'error'])
      if (raw.error !== undefined) {
        const error = record(raw.error, 'error')
        if (error.code !== undefined && typeof error.code !== 'number') boundedString(error.code, 1024, 'error.code')
        if (typeof error.code === 'number' && (!Number.isSafeInteger(error.code) || error.code < 0)) {
          return fail('GENERATION_V2_GEMINI_INTERACTIONS_STREAM_INVALID_EVENT', null, null, null, null, null,
            { fieldPath: 'error.code', reason: 'invalid_error_code' })
        }
        if (error.message !== undefined) boundedString(error.message, 4096, 'error.message')
        if (error.status !== undefined) boundedString(error.status, 1024, 'error.status')
        try { stableSerializeProviderRequestBoundedV2(error, MAX_ARTIFACT_BYTES) } catch {
          return fail('GENERATION_V2_GEMINI_INTERACTIONS_STREAM_LIMIT_EXCEEDED', raw, eventType, null, error)
        }
      }
      break
    default:
      return fail('GENERATION_V2_GEMINI_INTERACTIONS_STREAM_INVALID_EVENT')
  }
  return canonicalRaw(raw, eventType)
}

function withFrameDiagnostic(error: unknown, frame: string, raw: Readonly<Record<string, unknown>> | null = null,
  stage: GeminiInteractionsDiagnosticStageV1 = 'frame_decode'): never {
  if (!(error instanceof GeminiInteractionsImageStreamV1Error)) throw error
  const data = frame.split(/\r?\n/u).filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trimStart()).join('\n')
  if (!raw) {
    try {
      const parsed: unknown = JSON.parse(data)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) raw = parsed as Readonly<Record<string, unknown>>
    } catch { /* Keep the bounded wire excerpt for invalid JSON too. */ }
  }
  const step = raw?.step ?? raw?.delta
  const stepType = step && typeof step === 'object' && 'type' in step && typeof step.type === 'string' ? step.type : null
  const namedEvent = frame.split(/\r?\n/u).find((line) => line.startsWith('event:'))?.slice(6).trim()
  const eventType = error.eventType ?? (typeof raw?.event_type === 'string' ? raw.event_type : namedEvent ?? null)
  const contextEventType = eventType === 'done' || isKnownEventType(eventType) ? eventType : null
  throw new GeminiInteractionsImageStreamV1Error(error.code, error.rawEvent ?? raw,
    eventType, error.stepType ?? stepType, error.providerError, (error.rawFrameExcerpt ?? frame).slice(0, 8192),
    error.diagnosticStage ?? stage, error.fieldPath, error.diagnosticReason,
    error.diagnosticContext ?? Object.freeze({ contextKind: 'failing_frame', eventType: contextEventType }))
}

function withStreamFinishDiagnostic(error: unknown,
  context: Readonly<{ acceptedEventCount: number; lastAcceptedEventType: string | null }>): never {
  if (!(error instanceof GeminiInteractionsImageStreamV1Error)) throw error
  throw new GeminiInteractionsImageStreamV1Error(error.code, error.rawEvent, error.eventType, error.stepType,
    error.providerError, error.rawFrameExcerpt, error.diagnosticStage ?? 'stream_finish', error.fieldPath,
    error.diagnosticReason, error.diagnosticContext ?? Object.freeze({ contextKind: 'stream_snapshot', ...context }))
}

function withDecoderFinishDiagnostic(error: unknown,
  context: Readonly<{ acceptedEventCount: number; doneSeen: boolean }>): never {
  if (!(error instanceof GeminiInteractionsImageStreamV1Error) || error.diagnosticStage === 'frame_decode') throw error
  throw new GeminiInteractionsImageStreamV1Error(error.code, error.rawEvent, error.eventType, error.stepType,
    error.providerError, error.rawFrameExcerpt, error.diagnosticStage ?? 'stream_finish', error.fieldPath,
    error.diagnosticReason, error.diagnosticContext ?? Object.freeze({ contextKind: 'stream_snapshot', ...context }))
}

function parseSseFrame(frame: string): GeminiInteractionsImageNativeEventV1 | null {
  try { return parseSseFrameUnchecked(frame) } catch (error) { return withFrameDiagnostic(error, frame, null, 'frame_decode') }
}

function parseSseFrameUnchecked(frame: string): GeminiInteractionsImageNativeEventV1 | null {
  const data: string[] = []
  let event: string | null = null
  for (const line of frame.split(/\r?\n/u)) {
    if (line.length === 0 || line.startsWith(':')) continue
    const separator = line.indexOf(':')
    const field = separator < 0 ? line : line.slice(0, separator)
    const value = separator < 0 ? '' : line.slice(separator + 1).replace(/^ /u, '')
    if (field === 'data') data.push(value)
    else if (field === 'event') event = value.length === 0 ? null : boundedString(value, 256, 'event')
    else if (field === 'id') boundedString(value, 4096, 'id')
    else if (field === 'retry') {
      if (!/^\d{1,9}$/u.test(value)) return fail('GENERATION_V2_GEMINI_INTERACTIONS_STREAM_INVALID_SSE')
    }
    // Unknown SSE fields are ignored by the SSE protocol.
  }
  if (data.length === 0) return null
  const joined = data.join('\n')
  if (joined === '[DONE]') {
    if (event !== null && event !== 'done') return fail('GENERATION_V2_GEMINI_INTERACTIONS_STREAM_EVENT_MISMATCH')
    return Object.freeze({ eventType: 'done', canonicalJson: '{"event_type":"done"}', raw: null })
  }
  return parseJsonEvent(joined, event)
}

export class GeminiInteractionsImageSseDecoderV1 {
  readonly #decoder = new TextDecoder('utf-8', { fatal: true })
  #buffer = ''
  #wireBytes = 0
  #doneSeen = false
  #providerErrorSeen = false
  #finished = false
  #pendingParsedEvents: GeminiInteractionsImageNativeEventV1[] = []
  #acceptedEventCount = 0

  push(bytes: Uint8Array): readonly GeminiInteractionsImageNativeEventV1[] {
    this.#pendingParsedEvents = []
    if (this.#finished || !ArrayBuffer.isView(bytes) || bytes instanceof DataView ||
        Object.prototype.toString.call(bytes) !== '[object Uint8Array]') return fail('GENERATION_V2_GEMINI_INTERACTIONS_STREAM_INVALID_SSE')
    this.#wireBytes += bytes.byteLength
    if (this.#wireBytes > MAX_STREAM_BYTES) return fail('GENERATION_V2_GEMINI_INTERACTIONS_STREAM_LIMIT_EXCEEDED')
    try { this.#buffer += this.#decoder.decode(bytes, { stream: true }) } catch {
      return fail('GENERATION_V2_GEMINI_INTERACTIONS_STREAM_INVALID_SSE')
    }
    const events = this.#drain(false)
    this.#pendingParsedEvents = []
    return events
  }
  finish(): readonly GeminiInteractionsImageNativeEventV1[] {
    this.#pendingParsedEvents = []
    try {
      if (this.#finished) return fail('GENERATION_V2_GEMINI_INTERACTIONS_STREAM_INVALID_SSE')
      this.#finished = true
      try { this.#buffer += this.#decoder.decode() } catch { return fail('GENERATION_V2_GEMINI_INTERACTIONS_STREAM_INVALID_SSE') }
      const events = this.#drain(true)
      if (this.#buffer.length !== 0 || (!this.#doneSeen && !this.#providerErrorSeen)) {
        return fail('GENERATION_V2_GEMINI_INTERACTIONS_STREAM_TERMINAL_INVALID', null, null, null, null, null,
          { reason: 'stream_incomplete_or_invalid' })
      }
      this.#pendingParsedEvents = []
      return events
    } catch (error) {
      return withDecoderFinishDiagnostic(error, { acceptedEventCount: this.#acceptedEventCount, doneSeen: this.#doneSeen })
    }
  }
  takeParsedEventsAfterError(): readonly GeminiInteractionsImageNativeEventV1[] {
    const events = Object.freeze([...this.#pendingParsedEvents])
    this.#pendingParsedEvents = []
    return events
  }
  #drain(final: boolean): readonly GeminiInteractionsImageNativeEventV1[] {
    const events: GeminiInteractionsImageNativeEventV1[] = []
    while (true) {
      const match = /\r?\n\r?\n/u.exec(this.#buffer)
      if (!match || match.index === undefined) break
      const frame = this.#buffer.slice(0, match.index)
      this.#buffer = this.#buffer.slice(match.index + match[0].length)
      if (utf8ByteLength(frame) > MAX_FRAME_BYTES || this.#doneSeen) return fail('GENERATION_V2_GEMINI_INTERACTIONS_STREAM_INVALID_SSE')
      const event = parseSseFrame(frame)
      if (event) {
        if (event.eventType === 'done') this.#doneSeen = true
        if (event.eventType === 'error') this.#providerErrorSeen = true
        events.push(event)
        this.#pendingParsedEvents.push(event)
        this.#acceptedEventCount += 1
      }
    }
    if (final && this.#buffer.trim().length !== 0) {
      if (utf8ByteLength(this.#buffer) > MAX_FRAME_BYTES || this.#doneSeen) {
        return fail('GENERATION_V2_GEMINI_INTERACTIONS_STREAM_INVALID_SSE')
      }
      const event = parseSseFrame(this.#buffer)
      this.#buffer = ''
      if (event) {
        if (event.eventType === 'done') this.#doneSeen = true
        events.push(event)
        this.#pendingParsedEvents.push(event)
        this.#acceptedEventCount += 1
      }
    } else if (final) this.#buffer = ''
    return Object.freeze(events)
  }
}

export class GeminiInteractionsImageResultAssemblerV1 {
  readonly #expectedModel!: string
  #events: GeminiInteractionsImageNativeEventV1[] = []
  #createdSeen = false
  #createdId: string | null = null
  #activeStep: number | null = null
  #activeStepType: 'model_output' | 'thought' | GeminiInteractionsSearchStepTypeV1 | null = null
  #activeSearchId: string | null = null
  #chunks: string[] = []
  #textChunks: string[] = []
  #reasoningDetails: GeminiInteractionsReasoningDetailV1[] = []
  #annotations: Readonly<Record<string, unknown>>[] = []
  #searchEvents: Array<GeminiInteractionsSearchEvidenceV1['events'][number]> = []
  #searchCalls: Array<GeminiInteractionsSearchEvidenceV1['calls'][number]> = []
  #searchResults: Array<GeminiInteractionsSearchEvidenceV1['results'][number]> = []
  #mime: string | null = null
  #completed: Readonly<Record<string, unknown>> | null = null
  #done = false
  #failed = false
  #providerError: Readonly<Record<string, unknown>> | null = null
  #finished = false

  constructor(expectedModel: string) {
    if (typeof expectedModel !== 'string' || expectedModel.length < 1) return fail('GENERATION_V2_GEMINI_INTERACTIONS_STREAM_TERMINAL_INVALID')
    this.#expectedModel = expectedModel
  }

  push(event: GeminiInteractionsImageNativeEventV1): void {
    try { this.#push(event) } catch (error) { withFrameDiagnostic(error, event.canonicalJson, event.raw, 'event_assembly') }
  }
  #push(event: GeminiInteractionsImageNativeEventV1): void {
    if (this.#finished || this.#done) return fail('GENERATION_V2_GEMINI_INTERACTIONS_STREAM_TERMINAL_INVALID')
    this.#events.push(event)
    if (event.eventType === 'done') { this.#done = true; return }
    const raw = event.raw!
    if (event.eventType === 'error') {
      this.#failed = true
      this.#providerError = event.raw?.error && typeof event.raw.error === 'object' && !Array.isArray(event.raw.error)
        ? record(event.raw.error, 'error') : event.raw
      return
    }
    if (event.eventType === 'interaction.created') {
      if (this.#createdSeen || this.#activeStep !== null || this.#completed !== null) return fail('GENERATION_V2_GEMINI_INTERACTIONS_STREAM_TERMINAL_INVALID')
      const interaction = readInteraction(raw.interaction, false, 'interaction', true, true)
      if (interaction.model !== undefined && interaction.model !== this.#expectedModel) {
        return fail('GENERATION_V2_GEMINI_INTERACTIONS_STREAM_TERMINAL_INVALID')
      }
      this.#createdSeen = true
      if (interaction.id !== undefined && interaction.id !== '') this.#createdId = boundedString(interaction.id, 4096, 'interaction.id')
      return
    }
    if (!this.#createdSeen) return fail('GENERATION_V2_GEMINI_INTERACTIONS_STREAM_TERMINAL_INVALID')
    if (event.eventType === 'interaction.status_update') {
      if (raw.interaction_id !== undefined && raw.interaction_id !== '') {
        const interactionId = boundedString(raw.interaction_id, 4096, 'interaction_id')
        if (this.#createdId !== null && interactionId !== this.#createdId) {
          return fail('GENERATION_V2_GEMINI_INTERACTIONS_STREAM_TERMINAL_INVALID')
        }
        if (this.#createdId === null) this.#createdId = interactionId
      }
      return
    }
    if (event.eventType === 'step.start') {
      if (this.#activeStep !== null || this.#completed !== null) return fail('GENERATION_V2_GEMINI_INTERACTIONS_STREAM_TERMINAL_INVALID')
      this.#activeStep = index(raw.index, 'index')
      const step = record(raw.step, 'step')
      const stepType = typeof step.type === 'string' ? step.type : null
      this.#activeStepType = stepType === 'model_output' || stepType === 'thought'
        ? stepType
        : searchStepType(stepType)
      if (this.#activeStepType === null) {
        return fail('GENERATION_V2_GEMINI_INTERACTIONS_STREAM_UNSUPPORTED_SERVER_TOOL_STEP', raw, event.eventType, stepType)
      }
      if (this.#activeStepType === 'google_search_call' || this.#activeStepType === 'google_search_result') {
        this.#activeSearchId = this.#startSearchStep(event, this.#activeStepType, step)
        return
      }
      const content = step.content
      if (Array.isArray(content)) for (const [contentIndex, item] of content.entries()) {
        const output = readOutput(item, `step.content[${contentIndex}]`)
        if (this.#activeStepType === 'thought' && output.kind !== 'thought') {
          return fail('GENERATION_V2_GEMINI_INTERACTIONS_STREAM_UNSUPPORTED_CONTENT')
        }
        this.#appendOutput(output, `step.content[${contentIndex}]`)
      }
      return
    }
    if (event.eventType === 'step.delta') {
      if (this.#activeStep === null || index(raw.index, 'index') !== this.#activeStep) return fail('GENERATION_V2_GEMINI_INTERACTIONS_STREAM_TERMINAL_INVALID')
      const delta = record(raw.delta, 'delta')
      if (this.#activeStepType === 'google_search_call' || this.#activeStepType === 'google_search_result') {
        if (delta.type !== this.#activeStepType) return fail('GENERATION_V2_GEMINI_INTERACTIONS_STREAM_TERMINAL_INVALID')
        this.#deltaSearchStep(event, this.#activeStepType, delta)
        return
      }
      const output = readOutput(raw.delta, 'delta')
      if (this.#activeStepType === 'thought' && output.kind !== 'thought') {
        return fail('GENERATION_V2_GEMINI_INTERACTIONS_STREAM_UNSUPPORTED_CONTENT')
      }
      this.#appendOutput(output, 'delta'); return
    }
    if (event.eventType === 'step.stop') {
      if (this.#activeStep === null || index(raw.index, 'index') !== this.#activeStep) return fail('GENERATION_V2_GEMINI_INTERACTIONS_STREAM_TERMINAL_INVALID')
      if (this.#activeStepType === 'google_search_call' || this.#activeStepType === 'google_search_result') {
        this.#searchEvents.push(Object.freeze({ eventType: event.eventType as 'step.stop', stepIndex: this.#activeStep,
          stepType: this.#activeStepType, canonicalJson: event.canonicalJson, raw }))
      }
      this.#activeStep = null; this.#activeStepType = null; this.#activeSearchId = null; return
    }
    if (event.eventType === 'interaction.completed') {
      if (this.#activeStep !== null || this.#completed !== null) return fail('GENERATION_V2_GEMINI_INTERACTIONS_STREAM_TERMINAL_INVALID')
      const interaction = readInteraction(raw.interaction, true, 'interaction', true)
      if (interaction.id !== undefined && interaction.id !== '') {
        const interactionId = boundedString(interaction.id, 4096, 'interaction.id')
        if (this.#createdId !== null && interactionId !== this.#createdId) return fail('GENERATION_V2_GEMINI_INTERACTIONS_STREAM_TERMINAL_INVALID')
        this.#createdId = interactionId
      }
      this.#mergeTerminalSearchSteps(interaction.steps)
      this.#completed = interaction
    }
  }
  #append(image: Readonly<{ data: string | null; mime: string | null }>, path: string): void {
    if (image.mime !== null) {
      if (this.#mime !== null && this.#mime !== image.mime) return fail('GENERATION_V2_GEMINI_INTERACTIONS_STREAM_INVALID_EVENT', null, null,
        null, null, null, { fieldPath: childPath(path, 'mime_type'), reason: 'image_mime_conflict' })
      this.#mime = image.mime
    }
    if (image.data !== null) this.#chunks.push(image.data)
  }
  #appendOutput(output: ReturnType<typeof readOutput>, path: string): void {
    if (output.kind === 'image') this.#append(output.value, path)
    else if (output.kind === 'text') { this.#textChunks.push(output.value); this.#annotations.push(...output.annotations) }
    else this.#reasoningDetails.push(output.value)
  }

  #startSearchStep(event: GeminiInteractionsImageNativeEventV1, stepType: GeminiInteractionsSearchStepTypeV1,
    step: Readonly<Record<string, unknown>>): string {
    this.#searchEvents.push(Object.freeze({ eventType: event.eventType as 'step.start', stepIndex: this.#activeStep!, stepType,
      canonicalJson: event.canonicalJson, raw: event.raw! }))
    if (stepType === 'google_search_call') {
      const id = boundedString(step.id, 4096, 'step.id')
      if (this.#searchCalls.some((call) => call.id === id)) return fail('GENERATION_V2_GEMINI_INTERACTIONS_STREAM_TERMINAL_INVALID')
      this.#searchCalls.push(Object.freeze({ stepIndex: this.#activeStep!, id,
        arguments: step.arguments ?? null, signature: typeof step.signature === 'string' ? step.signature : null }))
      return id
    }
    const callId = boundedString(step.call_id, 4096, 'step.call_id')
    if (!this.#searchCalls.some((call) => call.id === callId) || this.#searchResults.some((result) => result.callId === callId)) {
      return fail('GENERATION_V2_GEMINI_INTERACTIONS_STREAM_TERMINAL_INVALID')
    }
    this.#searchResults.push(Object.freeze({ stepIndex: this.#activeStep!, callId, result: step.result ?? null,
      isError: typeof step.is_error === 'boolean' ? step.is_error : null,
      searchSuggestions: searchSuggestions(step.result), signature: typeof step.signature === 'string' ? step.signature : null }))
    return callId
  }

  #deltaSearchStep(event: GeminiInteractionsImageNativeEventV1, stepType: GeminiInteractionsSearchStepTypeV1,
    delta: Readonly<Record<string, unknown>>): void {
    this.#searchEvents.push(Object.freeze({ eventType: event.eventType as 'step.delta', stepIndex: this.#activeStep!, stepType,
      canonicalJson: event.canonicalJson, raw: event.raw! }))
    if (stepType === 'google_search_call') {
      const callIndex = this.#searchCalls.findIndex((item) => item.id === this.#activeSearchId)
      const call = callIndex < 0 ? null : this.#searchCalls[callIndex]
      if (!call) return fail('GENERATION_V2_GEMINI_INTERACTIONS_STREAM_TERMINAL_INVALID')
      this.#searchCalls[callIndex] = Object.freeze({ ...call,
        ...(delta.arguments === undefined ? {} : { arguments: delta.arguments }),
        ...(typeof delta.signature === 'string' ? { signature: delta.signature } : {}),
      })
      return
    }
    const resultIndex = this.#searchResults.findIndex((item) => item.callId === this.#activeSearchId)
    const result = resultIndex < 0 ? null : this.#searchResults[resultIndex]
    if (!result) return fail('GENERATION_V2_GEMINI_INTERACTIONS_STREAM_TERMINAL_INVALID')
    const suggestion = searchSuggestions(delta.result)
    this.#searchResults[resultIndex] = Object.freeze({ ...result,
      ...(delta.result === undefined ? {} : { result: delta.result }),
      ...(typeof delta.is_error === 'boolean' ? { isError: delta.is_error } : {}),
      ...(typeof delta.signature === 'string' ? { signature: delta.signature } : {}),
      ...(suggestion === null ? {} : { searchSuggestions: suggestion }),
    })
  }

  #mergeTerminalSearchSteps(steps: unknown): void {
    if (!Array.isArray(steps)) return
    for (const [stepIndex, value] of steps.entries()) {
      const stepPath = `interaction.steps[${stepIndex}]`
      const step = record(value, stepPath)
      const stepType = searchStepType(step.type)
      if (stepType === null) continue
      const canonicalJson = stableSerializeProviderRequestBoundedV2(step, MAX_ARTIFACT_BYTES)
      if (stepType === 'google_search_call') {
        const id = boundedString(step.id, 4096, `${stepPath}.id`)
        if (this.#searchCalls.some((call) => call.id === id)) continue
        this.#searchCalls.push(Object.freeze({ stepIndex, id, arguments: step.arguments ?? null,
          signature: typeof step.signature === 'string' ? step.signature : null }))
      } else {
        const callId = boundedString(step.call_id, 4096, `${stepPath}.call_id`)
        if (!this.#searchCalls.some((call) => call.id === callId) || this.#searchResults.some((result) => result.callId === callId)) {
          return fail('GENERATION_V2_GEMINI_INTERACTIONS_STREAM_TERMINAL_INVALID')
        }
        this.#searchResults.push(Object.freeze({ stepIndex, callId, result: step.result ?? null,
          isError: typeof step.is_error === 'boolean' ? step.is_error : null,
          searchSuggestions: searchSuggestions(step.result), signature: typeof step.signature === 'string' ? step.signature : null }))
      }
      this.#searchEvents.push(Object.freeze({ eventType: 'interaction.completed', stepIndex, stepType, canonicalJson, raw: step }))
    }
  }
  finish(): GeminiInteractionsImageResultV1 {
    try { return this.#finish() } catch (error) {
      return withStreamFinishDiagnostic(error, {
        acceptedEventCount: this.#events.length,
        lastAcceptedEventType: this.#events.at(-1)?.eventType ?? null,
      })
    }
  }
  #finish(): GeminiInteractionsImageResultV1 {
    if (this.#finished || !this.#createdSeen || !this.#done || this.#failed || this.#activeStep !== null || !this.#completed ||
        this.#chunks.length === 0 || this.#mime === null ||
        (this.#completed.model !== undefined && this.#completed.model !== this.#expectedModel)) {
      const providerErrorEvent = this.#failed ? this.#events.find((event) => event.eventType === 'error') : null
      return fail(this.#failed ? 'GENERATION_V2_GEMINI_INTERACTIONS_STREAM_PROVIDER_FAILED'
        : 'GENERATION_V2_GEMINI_INTERACTIONS_STREAM_TERMINAL_INVALID',
      providerErrorEvent?.raw ?? null, this.#failed ? 'error' : null, null, this.#providerError,
      providerErrorEvent?.canonicalJson ?? null, { reason: 'stream_incomplete_or_invalid' })
    }
    this.#finished = true
    const encoded = this.#chunks.join('')
    if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(encoded)) {
      return fail('GENERATION_V2_GEMINI_INTERACTIONS_STREAM_INVALID_EVENT', null, null, null, null, null,
        { fieldPath: 'image.data', reason: 'invalid_base64' })
    }
    const bytes = decodeBase64Bytes(encoded)
    if (bytes.length === 0 || bytes.length > MAX_STREAM_BYTES || encodeBase64Bytes(bytes) !== encoded) {
      return fail('GENERATION_V2_GEMINI_INTERACTIONS_STREAM_INVALID_EVENT', null, null, null, null, null,
        { fieldPath: 'image.data', reason: bytes.length > MAX_STREAM_BYTES ? 'invalid_image_bytes' : 'invalid_base64' })
    }
    return Object.freeze({ bytes: new Uint8Array(bytes), mime: this.#mime,
      interactionId: this.#createdId, model: this.#expectedModel, text: this.#textChunks.join(''),
      reasoningDetails: Object.freeze([...this.#reasoningDetails]),
      usage: this.#completed.usage === undefined ? Object.freeze({}) : record(this.#completed.usage, 'interaction.usage'),
      events: Object.freeze([...this.#events]),
      searchEvidence: Object.freeze({ events: Object.freeze([...this.#searchEvents]), calls: Object.freeze([...this.#searchCalls]),
        results: Object.freeze([...this.#searchResults]), annotations: Object.freeze([...this.#annotations]) }) })
  }
}

function searchSuggestions(value: unknown): string | null {
  if (typeof value === 'string') return null
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = searchSuggestions(item)
      if (found !== null) return found
    }
    return null
  }
  if (!value || typeof value !== 'object') return null
  const object = value as Record<string, unknown>
  if (typeof object.search_suggestions === 'string') return object.search_suggestions
  return null
}

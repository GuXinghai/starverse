import {
  sha256PreparedBytesV2,
  stableSerializeProviderRequestBoundedV2,
} from '../../compiler/stableSerialize'

export const GEMINI_GENERATE_CONTENT_NATIVE_HISTORY_KIND_V1 =
  'gemini_generate_content_native_history_v1'
export const GEMINI_GENERATE_CONTENT_HISTORY_MAX_BYTES_V1 = 20 * 1_024 * 1_024

export type GeminiGenerateContentPartV1 = Readonly<
  | { text: string; thought?: true; thoughtSignature?: string }
  | { inlineData: Readonly<{ mimeType: string; data: string }>; thought?: true; thoughtSignature?: string }
  | { fileData: Readonly<{ mimeType: string; fileUri: string }> }
  | { functionCall: Readonly<{ name: string; args: Readonly<Record<string, unknown>> }>; thoughtSignature?: string }
  | { functionResponse: Readonly<{ name: string; response: Readonly<Record<string, unknown>> }> }
>

export type GeminiGenerateContentNativeContentV1 = Readonly<{
  role: 'user' | 'model'
  parts: readonly GeminiGenerateContentPartV1[]
}>

export type GeminiGenerateContentNativeHistoryArtifactV1 = Readonly<{
  schemaVersion: 1
  artifactKind: typeof GEMINI_GENERATE_CONTENT_NATIVE_HISTORY_KIND_V1
  artifactCodecVersion: 1
  operationId: string
  answerRootId: string
  requestSequence: number
  lineageDepth: number
  parentArtifactHash: string | null
  orderedContents: readonly GeminiGenerateContentNativeContentV1[]
  artifactHash: string
}>

export class GeminiGenerateContentNativeHistoryV1Error extends Error {
  constructor(readonly code:
    | 'GENERATION_V2_GEMINI_HISTORY_INVALID'
    | 'GENERATION_V2_GEMINI_HISTORY_LIMIT_EXCEEDED') {
    super(code)
    this.name = 'GeminiGenerateContentNativeHistoryV1Error'
  }
}

function plainRecord(value: unknown): Readonly<Record<string, unknown>> {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new GeminiGenerateContentNativeHistoryV1Error('GENERATION_V2_GEMINI_HISTORY_INVALID')
  }
  return value as Readonly<Record<string, unknown>>
}

function cloneJsonRecord(value: unknown): Readonly<Record<string, unknown>> {
  try {
    const serialized = stableSerializeProviderRequestBoundedV2(
      plainRecord(value),
      GEMINI_GENERATE_CONTENT_HISTORY_MAX_BYTES_V1,
    )
    return Object.freeze(JSON.parse(serialized) as Record<string, unknown>)
  } catch {
    throw new GeminiGenerateContentNativeHistoryV1Error('GENERATION_V2_GEMINI_HISTORY_INVALID')
  }
}

function requiredString(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new GeminiGenerateContentNativeHistoryV1Error('GENERATION_V2_GEMINI_HISTORY_INVALID')
  }
  return value
}

function optionalThoughtFields(record: Readonly<Record<string, unknown>>): Readonly<{
  thought?: true
  thoughtSignature?: string
}> {
  if (record.thought !== undefined && record.thought !== true) {
    throw new GeminiGenerateContentNativeHistoryV1Error('GENERATION_V2_GEMINI_HISTORY_INVALID')
  }
  if (record.thoughtSignature !== undefined &&
      (typeof record.thoughtSignature !== 'string' || record.thoughtSignature.length === 0)) {
    throw new GeminiGenerateContentNativeHistoryV1Error('GENERATION_V2_GEMINI_HISTORY_INVALID')
  }
  return Object.freeze({
    ...(record.thought === true ? { thought: true as const } : {}),
    ...(typeof record.thoughtSignature === 'string' ? { thoughtSignature: record.thoughtSignature } : {}),
  })
}

export function decodeGeminiGenerateContentPartV1(value: unknown): GeminiGenerateContentPartV1 {
  const input = plainRecord(value)
  const payloadKeys = ['text', 'inlineData', 'fileData', 'functionCall', 'functionResponse']
    .filter((key) => input[key] !== undefined)
  if (payloadKeys.length !== 1 || Object.keys(input).some((key) =>
    ![...payloadKeys, 'thought', 'thoughtSignature'].includes(key))) {
    throw new GeminiGenerateContentNativeHistoryV1Error('GENERATION_V2_GEMINI_HISTORY_INVALID')
  }
  const thought = optionalThoughtFields(input)
  if (input.text !== undefined) {
    if (typeof input.text !== 'string' ||
        (input.text.length === 0 && thought.thoughtSignature === undefined)) {
      throw new GeminiGenerateContentNativeHistoryV1Error('GENERATION_V2_GEMINI_HISTORY_INVALID')
    }
    return Object.freeze({ text: input.text, ...thought })
  }
  if (input.inlineData !== undefined) {
    const data = plainRecord(input.inlineData)
    if (Object.keys(data).some((key) => !['mimeType', 'data'].includes(key))) {
      throw new GeminiGenerateContentNativeHistoryV1Error('GENERATION_V2_GEMINI_HISTORY_INVALID')
    }
    return Object.freeze({
      inlineData: Object.freeze({ mimeType: requiredString(data.mimeType), data: requiredString(data.data) }),
      ...thought,
    })
  }
  if (input.fileData !== undefined) {
    if (thought.thought || thought.thoughtSignature) {
      throw new GeminiGenerateContentNativeHistoryV1Error('GENERATION_V2_GEMINI_HISTORY_INVALID')
    }
    const data = plainRecord(input.fileData)
    if (Object.keys(data).some((key) => !['mimeType', 'fileUri'].includes(key))) {
      throw new GeminiGenerateContentNativeHistoryV1Error('GENERATION_V2_GEMINI_HISTORY_INVALID')
    }
    return Object.freeze({ fileData: Object.freeze({
      mimeType: requiredString(data.mimeType), fileUri: requiredString(data.fileUri),
    }) })
  }
  if (input.functionCall !== undefined) {
    if (thought.thought) throw new GeminiGenerateContentNativeHistoryV1Error('GENERATION_V2_GEMINI_HISTORY_INVALID')
    const call = plainRecord(input.functionCall)
    if (Object.keys(call).some((key) => !['name', 'args'].includes(key))) {
      throw new GeminiGenerateContentNativeHistoryV1Error('GENERATION_V2_GEMINI_HISTORY_INVALID')
    }
    return Object.freeze({ functionCall: Object.freeze({
      name: requiredString(call.name), args: cloneJsonRecord(call.args ?? {}),
    }), ...(thought.thoughtSignature ? { thoughtSignature: thought.thoughtSignature } : {}) })
  }
  if (thought.thought || thought.thoughtSignature) {
    throw new GeminiGenerateContentNativeHistoryV1Error('GENERATION_V2_GEMINI_HISTORY_INVALID')
  }
  const response = plainRecord(input.functionResponse)
  if (Object.keys(response).some((key) => !['name', 'response'].includes(key))) {
    throw new GeminiGenerateContentNativeHistoryV1Error('GENERATION_V2_GEMINI_HISTORY_INVALID')
  }
  return Object.freeze({ functionResponse: Object.freeze({
    name: requiredString(response.name), response: cloneJsonRecord(response.response),
  }) })
}

export function decodeGeminiGenerateContentNativeContentV1(
  value: unknown,
): GeminiGenerateContentNativeContentV1 {
  const input = plainRecord(value)
  if (Object.keys(input).some((key) => !['role', 'parts'].includes(key)) ||
      (input.role !== 'user' && input.role !== 'model') || !Array.isArray(input.parts) ||
      input.parts.length === 0 || input.parts.length > 1024) {
    throw new GeminiGenerateContentNativeHistoryV1Error('GENERATION_V2_GEMINI_HISTORY_INVALID')
  }
  return Object.freeze({
    role: input.role,
    parts: Object.freeze(input.parts.map(decodeGeminiGenerateContentPartV1)),
  })
}

export function createGeminiGenerateContentNativeHistoryArtifactV1(input: Readonly<{
  operationId: string
  answerRootId: string
  requestSequence: number
  lineageDepth: number
  parentArtifactHash: string | null
  orderedContents: readonly unknown[]
}>): GeminiGenerateContentNativeHistoryArtifactV1 {
  if (!Number.isSafeInteger(input.requestSequence) || input.requestSequence < 1 ||
      !Number.isSafeInteger(input.lineageDepth) || input.lineageDepth < 1 ||
      (input.lineageDepth === 1) !== (input.parentArtifactHash === null)) {
    throw new GeminiGenerateContentNativeHistoryV1Error('GENERATION_V2_GEMINI_HISTORY_INVALID')
  }
  const projection = Object.freeze({
    schemaVersion: 1 as const,
    artifactKind: GEMINI_GENERATE_CONTENT_NATIVE_HISTORY_KIND_V1,
    artifactCodecVersion: 1 as const,
    operationId: requiredString(input.operationId),
    answerRootId: requiredString(input.answerRootId),
    requestSequence: input.requestSequence,
    lineageDepth: input.lineageDepth,
    parentArtifactHash: input.parentArtifactHash,
    orderedContents: Object.freeze(input.orderedContents.map(decodeGeminiGenerateContentNativeContentV1)),
  })
  let canonical: string
  try {
    canonical = stableSerializeProviderRequestBoundedV2(
      projection,
      GEMINI_GENERATE_CONTENT_HISTORY_MAX_BYTES_V1,
    )
  } catch {
    throw new GeminiGenerateContentNativeHistoryV1Error('GENERATION_V2_GEMINI_HISTORY_LIMIT_EXCEEDED')
  }
  return Object.freeze({
    ...projection,
    artifactHash: sha256PreparedBytesV2(new TextEncoder().encode(canonical)),
  })
}

export function decodeGeminiGenerateContentNativeHistoryArtifactV1(
  value: unknown,
): GeminiGenerateContentNativeHistoryArtifactV1 {
  const input = plainRecord(value)
  if (input.schemaVersion !== 1 || input.artifactKind !== GEMINI_GENERATE_CONTENT_NATIVE_HISTORY_KIND_V1 ||
      input.artifactCodecVersion !== 1 ||
      typeof input.artifactHash !== 'string') {
    throw new GeminiGenerateContentNativeHistoryV1Error('GENERATION_V2_GEMINI_HISTORY_INVALID')
  }
  const decoded = createGeminiGenerateContentNativeHistoryArtifactV1({
    operationId: input.operationId as string,
    answerRootId: input.answerRootId as string,
    requestSequence: input.requestSequence as number,
    lineageDepth: input.lineageDepth as number,
    parentArtifactHash: input.parentArtifactHash as string | null,
    orderedContents: input.orderedContents as readonly unknown[],
  })
  if (decoded.artifactHash !== input.artifactHash) {
    throw new GeminiGenerateContentNativeHistoryV1Error('GENERATION_V2_GEMINI_HISTORY_INVALID')
  }
  return decoded
}

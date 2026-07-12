import {
  ProviderNativeValidationError,
  clonePlainJsonObject,
  clonePlainJsonValue,
  validateJsonByteLimit,
  type ProviderNativeStatus,
} from '@/next/provider/providerNativeContent'

export const GEMINI_PROVIDER_NATIVE_PROVIDER_KEY = 'google_ai_studio' as const
export const GEMINI_GENERATE_CONTENT_SOURCE_API = 'gemini_generate_content' as const

export const GEMINI_PROVIDER_NATIVE_STATUSES = ['streaming', 'final', 'error', 'cancelled'] as const

export type GeminiProviderNativeStatus = ProviderNativeStatus

export type GeminiProviderNativePart = Readonly<Record<string, unknown>>

export type GeminiProviderNativeContent = Readonly<{
  role: string
  parts: ReadonlyArray<GeminiProviderNativePart>
}>

export type GeminiProviderNativeSnapshot = Readonly<{
  providerKey: typeof GEMINI_PROVIDER_NATIVE_PROVIDER_KEY
  sourceApi: typeof GEMINI_GENERATE_CONTENT_SOURCE_API
  snapshotKey: string
  candidateIndex: number
  status: GeminiProviderNativeStatus
  content: GeminiProviderNativeContent
  finishReason?: string
  usageMetadata?: Readonly<Record<string, unknown>>
  modelVersion?: string
}>

export const MAX_GEMINI_NATIVE_PART_BYTES = 2 * 1024 * 1024
export const MAX_GEMINI_NATIVE_SNAPSHOT_BYTES = 8 * 1024 * 1024

export class GeminiProviderNativeValidationError extends ProviderNativeValidationError {
  constructor(message: string) {
    super(message)
    this.name = 'GeminiProviderNativeValidationError'
  }
}

export function isGeminiProviderNativeSnapshot(value: unknown): value is GeminiProviderNativeSnapshot {
  try {
    normalizeGeminiProviderNativeSnapshot(value)
    return true
  } catch {
    return false
  }
}

export function normalizeGeminiProviderNativeSnapshot(value: unknown): GeminiProviderNativeSnapshot {
  const record = clonePlainJsonObject(value, '$')
  const providerKey = record.providerKey
  const sourceApi = record.sourceApi
  const candidateIndex = record.candidateIndex
  const status = record.status

  if (providerKey !== GEMINI_PROVIDER_NATIVE_PROVIDER_KEY) {
    throw new GeminiProviderNativeValidationError('Gemini native snapshot providerKey is invalid')
  }
  if (sourceApi !== GEMINI_GENERATE_CONTENT_SOURCE_API) {
    throw new GeminiProviderNativeValidationError('Gemini native snapshot sourceApi is invalid')
  }
  if (typeof candidateIndex !== 'number' || !Number.isInteger(candidateIndex) || candidateIndex < 0) {
    throw new GeminiProviderNativeValidationError('Gemini native snapshot candidateIndex is invalid')
  }
  if (!GEMINI_PROVIDER_NATIVE_STATUSES.includes(status as GeminiProviderNativeStatus)) {
    throw new GeminiProviderNativeValidationError('Gemini native snapshot status is invalid')
  }
  const snapshotKey = typeof record.snapshotKey === 'string' && record.snapshotKey.trim()
    ? record.snapshotKey.trim()
    : `candidate:${candidateIndex}`

  const content = normalizeGeminiProviderNativeContent(record.content)
  const normalized: Record<string, unknown> = {
    providerKey,
    sourceApi,
    snapshotKey,
    candidateIndex,
    status,
    content,
  }

  if (typeof record.finishReason === 'string' && record.finishReason.trim()) {
    normalized.finishReason = record.finishReason
  }
  if (record.usageMetadata !== undefined) {
    normalized.usageMetadata = clonePlainJsonObject(record.usageMetadata, '$.usageMetadata')
  }
  if (typeof record.modelVersion === 'string' && record.modelVersion.trim()) {
    normalized.modelVersion = record.modelVersion
  }

  validateSnapshotByteLimits(normalized)
  return normalized as GeminiProviderNativeSnapshot
}

export function normalizeGeminiProviderNativeContent(value: unknown): GeminiProviderNativeContent {
  const record = clonePlainJsonObject(value, '$.content')
  const role = typeof record.role === 'string' ? record.role.trim() : ''
  if (!role) {
    throw new GeminiProviderNativeValidationError('Gemini native content.role is required')
  }
  if (!Array.isArray(record.parts)) {
    throw new GeminiProviderNativeValidationError('Gemini native content.parts must be an array')
  }
  const parts = record.parts.map((part, index) => {
    const cloned = clonePlainJsonObject(part, `$.content.parts[${index}]`)
    validateJsonByteLimit(cloned, MAX_GEMINI_NATIVE_PART_BYTES, `Gemini native part ${index} is too large`)
    return cloned
  })
  return { role, parts }
}

export function cloneGeminiProviderNativeSnapshot(value: GeminiProviderNativeSnapshot): GeminiProviderNativeSnapshot {
  return normalizeGeminiProviderNativeSnapshot(value)
}

export function cloneGeminiProviderNativeContent(value: GeminiProviderNativeContent): GeminiProviderNativeContent {
  return normalizeGeminiProviderNativeContent(value)
}

export function isFinalGeminiProviderNativeSnapshot(value: unknown): value is GeminiProviderNativeSnapshot {
  try {
    const snapshot = normalizeGeminiProviderNativeSnapshot(value)
    return snapshot.status === 'final'
  } catch {
    return false
  }
}

export function assertFinalGeminiProviderNativeSnapshot(value: unknown): GeminiProviderNativeSnapshot {
  const snapshot = normalizeGeminiProviderNativeSnapshot(value)
  if (snapshot.status !== 'final') {
    throw new GeminiProviderNativeValidationError(`Gemini native snapshot is not final: ${snapshot.status}`)
  }
  return snapshot
}

function validateSnapshotByteLimits(snapshot: Record<string, unknown>) {
  validateJsonByteLimit(snapshot, MAX_GEMINI_NATIVE_SNAPSHOT_BYTES, 'Gemini native snapshot is too large')
}

export { clonePlainJsonObject, clonePlainJsonValue }

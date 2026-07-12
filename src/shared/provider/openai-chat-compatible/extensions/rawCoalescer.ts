import type { CompatibleJsonValue } from '../request/messageTypes'
import type { CompatibleExtensionContext, CompatibleExtensionMode, CompatibleExtensionSemantic, CompatibleRawExtensionDraft } from './extensionTypes'
import { normalizeCompatibleExtensionPath } from './pathDsl'
import { redactCompatibleExtensionValue } from './rawRedactor'

export const COMPATIBLE_RAW_RECORD_MAX_BYTES = 16 * 1024
export const COMPATIBLE_RAW_RECORDS_PER_RESPONSE_MAX = 256
export const COMPATIBLE_RAW_BYTES_PER_RESPONSE_MAX = 256 * 1024
export const COMPATIBLE_RAW_OVERFLOW_SUMMARY_RESERVED_BYTES = 512

export function coalesceCompatibleRawExtensions(context: CompatibleExtensionContext, input: readonly Readonly<{
  context: CompatibleExtensionContext
  sequence: number
  choiceIndex?: number
  sourcePath: readonly (string | number)[]
  value: CompatibleJsonValue
  mode?: CompatibleExtensionMode
  semantic?: CompatibleExtensionSemantic
}>[]): Readonly<{ records: readonly CompatibleRawExtensionDraft[]; droppedCount: number; complete: boolean }> {
  const pinnedContext: CompatibleExtensionContext = Object.freeze({ ...context, allowedMappings: Object.freeze(context.allowedMappings.map((pin) => Object.freeze({ ...pin }))) })
  const byKey = new Map<string, CompatibleRawExtensionDraft>()
  const dropped: Array<{ path: string; shape: number }> = []
  let droppedCount = 0
  let totalBytes = 0
  for (const item of input) {
    if (!sameContext(pinnedContext, item.context)) throw new Error('compatible_raw_extension_identity_mismatch')
    const sourcePath = normalizeCompatibleExtensionPath(item.sourcePath)
    const choiceIndex = item.choiceIndex ?? 0
    const mode = item.mode ?? (typeof item.value === 'string' ? 'append' : 'snapshot')
    const semantic = item.semantic ?? 'diagnostic'
    const key = `${pinnedContext.routeProvenanceId}\u0000${pinnedContext.responseProfileId}\u0000${pinnedContext.responseProfileVersion}\u0000${choiceIndex}\u0000${semantic}\u0000${mode}\u0000${sourcePath}`
    const previous = byKey.get(key)
    const rawValue = mode === 'append' && previous && typeof previous.value === 'string' && typeof item.value === 'string'
      ? previous.value + item.value
      : item.value
    const finalSegment = item.sourcePath[item.sourcePath.length - 1]
    const redacted = redactCompatibleExtensionValue(rawValue, typeof finalSegment === 'string' ? finalSegment : undefined)
    const serialized = JSON.stringify(redacted.value)
    const valueBytes = new TextEncoder().encode(serialized).byteLength
    if (valueBytes > COMPATIBLE_RAW_RECORD_MAX_BYTES) {
      droppedCount += 1
      dropped.push({ path: sourcePath, shape: shapeCode(item.value) })
      continue
    }
    const next: CompatibleRawExtensionDraft = Object.freeze({
      context: pinnedContext,
      choiceIndex,
      sourcePath,
      sequenceStart: previous?.sequenceStart ?? item.sequence,
      sequenceEnd: item.sequence,
      mode,
      semantic,
      value: redacted.value,
      valueBytes,
      redactionState: redacted.redactionState,
    })
    totalBytes += valueBytes - (previous?.valueBytes ?? 0)
    if ((!previous && byKey.size >= COMPATIBLE_RAW_RECORDS_PER_RESPONSE_MAX - 1) || totalBytes > COMPATIBLE_RAW_BYTES_PER_RESPONSE_MAX - COMPATIBLE_RAW_OVERFLOW_SUMMARY_RESERVED_BYTES) {
      totalBytes -= valueBytes - (previous?.valueBytes ?? 0)
      droppedCount += 1
      dropped.push({ path: sourcePath, shape: shapeCode(item.value) })
      continue
    }
    byKey.set(key, next)
  }
  if (droppedCount > 0) {
    const value = { dropped: { count: droppedCount, hash: hashSummary(dropped), valueType: dropped.reduce((mask, item) => mask | item.shape, 0) } } as const
    const valueBytes = new TextEncoder().encode(JSON.stringify(value)).byteLength
    if (valueBytes > COMPATIBLE_RAW_OVERFLOW_SUMMARY_RESERVED_BYTES) throw new Error('compatible_raw_overflow_summary_invalid')
    byKey.set(`${pinnedContext.routeProvenanceId}\u0000overflow`, Object.freeze({ context: pinnedContext, choiceIndex: 0, sourcePath: '$overflow', sequenceStart: 0, sequenceEnd: 0, mode: 'snapshot', semantic: 'diagnostic', value, valueBytes, redactionState: 'dropped' }))
  }
  return Object.freeze({ records: Object.freeze([...byKey.values()]), droppedCount, complete: droppedCount === 0 })
}

function sameContext(left: CompatibleExtensionContext, right: CompatibleExtensionContext): boolean {
  return left.routeProvenanceId === right.routeProvenanceId && left.messageId === right.messageId && left.providerInstanceId === right.providerInstanceId && left.responseProfileId === right.responseProfileId && left.responseProfileVersion === right.responseProfileVersion
}

function hashSummary(input: readonly unknown[]): number {
  const text = JSON.stringify(input)
  let hash = 2166136261
  for (let index = 0; index < text.length; index += 1) hash = Math.imul(hash ^ text.charCodeAt(index), 16777619)
  return hash >>> 0
}

function shapeCode(value: unknown): number {
  if (value === null) return 1
  if (Array.isArray(value)) return 16
  return ({ boolean: 2, number: 4, string: 8, object: 32 } as Record<string, number>)[typeof value] ?? 64
}

import type { AnthropicNativeContentBlock, AnthropicProviderNativeSnapshot } from '@/shared/provider/providerNativeContracts'
export type { AnthropicProviderNativeStatus, AnthropicNativeContentBlock, AnthropicProviderNativeSnapshot } from '@/shared/provider/providerNativeContracts'
import {
  ProviderNativeValidationError,
  clonePlainJsonArray,
  clonePlainJsonObject,
  clonePlainJsonValue,
  validateJsonByteLimit,
} from '@/core/provider/providerNativeContent'

export const ANTHROPIC_PROVIDER_NATIVE_PROVIDER_KEY = 'anthropic' as const
export const ANTHROPIC_MESSAGES_SOURCE_API = 'anthropic_messages' as const
export const ANTHROPIC_ASSISTANT_SNAPSHOT_KEY = 'assistant' as const






export const MAX_ANTHROPIC_NATIVE_BLOCK_BYTES = 2 * 1024 * 1024
export const MAX_ANTHROPIC_NATIVE_SNAPSHOT_BYTES = 8 * 1024 * 1024
const MAX_ANTHROPIC_NATIVE_CAPACITY_BYTES = 64 * 1024 * 1024

export type AnthropicProviderNativeSnapshotCapacityV1 = Readonly<{
  maxBlockBytes: number
  maxSnapshotBytes: number
}>

const LEGACY_SNAPSHOT_CAPACITY: AnthropicProviderNativeSnapshotCapacityV1 = Object.freeze({
  maxBlockBytes: MAX_ANTHROPIC_NATIVE_BLOCK_BYTES,
  maxSnapshotBytes: MAX_ANTHROPIC_NATIVE_SNAPSHOT_BYTES,
})

export class AnthropicProviderNativeValidationError extends ProviderNativeValidationError {
  constructor(message: string) {
    super(message)
    this.name = 'AnthropicProviderNativeValidationError'
  }
}

function snapshotCapacity(
  value?: AnthropicProviderNativeSnapshotCapacityV1,
): AnthropicProviderNativeSnapshotCapacityV1 {
  const capacity = value ?? LEGACY_SNAPSHOT_CAPACITY
  if (!capacity || typeof capacity !== 'object' ||
      !Number.isSafeInteger(capacity.maxBlockBytes) || capacity.maxBlockBytes < 1 ||
      capacity.maxBlockBytes > MAX_ANTHROPIC_NATIVE_CAPACITY_BYTES ||
      !Number.isSafeInteger(capacity.maxSnapshotBytes) || capacity.maxSnapshotBytes < capacity.maxBlockBytes ||
      capacity.maxSnapshotBytes > MAX_ANTHROPIC_NATIVE_CAPACITY_BYTES) {
    throw new AnthropicProviderNativeValidationError('Anthropic native snapshot capacity is invalid')
  }
  return capacity
}

export function normalizeAnthropicProviderNativeSnapshot(
  value: unknown,
  capacityValue?: AnthropicProviderNativeSnapshotCapacityV1,
): AnthropicProviderNativeSnapshot {
  const capacity = snapshotCapacity(capacityValue)
  const record = clonePlainJsonObject(value, '$')
  if (record.providerKey !== ANTHROPIC_PROVIDER_NATIVE_PROVIDER_KEY) {
    throw new AnthropicProviderNativeValidationError('Anthropic native snapshot providerKey is invalid')
  }
  if (record.sourceApi !== ANTHROPIC_MESSAGES_SOURCE_API) {
    throw new AnthropicProviderNativeValidationError('Anthropic native snapshot sourceApi is invalid')
  }
  if (record.snapshotKey !== ANTHROPIC_ASSISTANT_SNAPSHOT_KEY) {
    throw new AnthropicProviderNativeValidationError('Anthropic native snapshot snapshotKey is invalid')
  }
  if (record.role !== 'assistant') {
    throw new AnthropicProviderNativeValidationError('Anthropic native snapshot role must be assistant')
  }
  if (!['streaming', 'final', 'error', 'cancelled'].includes(record.status as string)) {
    throw new AnthropicProviderNativeValidationError('Anthropic native snapshot status is invalid')
  }

  const content = normalizeAnthropicNativeContentBlocks(record.content, capacity.maxBlockBytes)
  const normalized: Record<string, unknown> = {
    providerKey: ANTHROPIC_PROVIDER_NATIVE_PROVIDER_KEY,
    sourceApi: ANTHROPIC_MESSAGES_SOURCE_API,
    snapshotKey: ANTHROPIC_ASSISTANT_SNAPSHOT_KEY,
    role: 'assistant',
    status: record.status,
    content,
  }

  if (typeof record.model === 'string' && record.model.trim()) {
    normalized.model = record.model.trim()
  }
  if (typeof record.stopReason === 'string' && record.stopReason.trim()) {
    normalized.stopReason = record.stopReason.trim()
  }
  if (record.stopSequence === null || typeof record.stopSequence === 'string') {
    normalized.stopSequence = record.stopSequence
  }
  if (record.usage !== undefined) {
    normalized.usage = clonePlainJsonValue(record.usage, '$.usage')
  }
  if (record.diagnostics !== undefined) {
    const diagnostics = clonePlainJsonArray(record.diagnostics, '$.diagnostics')
      .map((item, index) => {
        const cloned = clonePlainJsonObject(item, `$.diagnostics[${index}]`)
        validateJsonByteLimit(cloned, 128 * 1024, `Anthropic native diagnostic ${index} is too large`)
        return cloned
      })
    if (diagnostics.length > 0) normalized.diagnostics = diagnostics
  }

  validateJsonByteLimit(normalized, capacity.maxSnapshotBytes, 'Anthropic native snapshot is too large')
  return normalized as AnthropicProviderNativeSnapshot
}

export function normalizeAnthropicNativeContentBlocks(
  value: unknown,
  maxBlockBytes = MAX_ANTHROPIC_NATIVE_BLOCK_BYTES,
): AnthropicNativeContentBlock[] {
  if (!Number.isSafeInteger(maxBlockBytes) || maxBlockBytes < 1 ||
      maxBlockBytes > MAX_ANTHROPIC_NATIVE_CAPACITY_BYTES) {
    throw new AnthropicProviderNativeValidationError('Anthropic native content block capacity is invalid')
  }
  const blocks = clonePlainJsonArray(value, '$.content')
  return blocks.map((block, index) => {
    const cloned = clonePlainJsonObject(block, `$.content[${index}]`)
    validateJsonByteLimit(cloned, maxBlockBytes, `Anthropic native content block ${index} is too large`)
    return cloned
  })
}

export function isFinalAnthropicProviderNativeSnapshot(
  value: unknown,
  capacity?: AnthropicProviderNativeSnapshotCapacityV1,
): value is AnthropicProviderNativeSnapshot {
  try {
    const snapshot = normalizeAnthropicProviderNativeSnapshot(value, capacity)
    return snapshot.status === 'final'
  } catch {
    return false
  }
}

export function assertFinalAnthropicProviderNativeSnapshot(
  value: unknown,
  capacity?: AnthropicProviderNativeSnapshotCapacityV1,
): AnthropicProviderNativeSnapshot {
  const snapshot = normalizeAnthropicProviderNativeSnapshot(value, capacity)
  if (snapshot.status !== 'final') {
    throw new AnthropicProviderNativeValidationError(`Anthropic native snapshot is not final: ${snapshot.status}`)
  }
  return snapshot
}

export function cloneAnthropicNativeContentBlocks(
  value: ReadonlyArray<AnthropicNativeContentBlock>,
): AnthropicNativeContentBlock[] {
  return normalizeAnthropicNativeContentBlocks(value)
}

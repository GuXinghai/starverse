import {
  ProviderNativeValidationError,
  clonePlainJsonArray,
  clonePlainJsonObject,
  clonePlainJsonValue,
  validateJsonByteLimit,
  type ProviderNativeStatus,
} from '@/next/provider/providerNativeContent'

export const ANTHROPIC_PROVIDER_NATIVE_PROVIDER_KEY = 'anthropic' as const
export const ANTHROPIC_MESSAGES_SOURCE_API = 'anthropic_messages' as const
export const ANTHROPIC_ASSISTANT_SNAPSHOT_KEY = 'assistant' as const

export type AnthropicProviderNativeStatus = ProviderNativeStatus
export type AnthropicNativeContentBlock = Readonly<Record<string, unknown>>

export type AnthropicProviderNativeSnapshot = Readonly<{
  providerKey: typeof ANTHROPIC_PROVIDER_NATIVE_PROVIDER_KEY
  sourceApi: typeof ANTHROPIC_MESSAGES_SOURCE_API
  snapshotKey: typeof ANTHROPIC_ASSISTANT_SNAPSHOT_KEY
  role: 'assistant'
  status: AnthropicProviderNativeStatus
  content: ReadonlyArray<AnthropicNativeContentBlock>
  model?: string
  stopReason?: string
  stopSequence?: string | null
  usage?: unknown
  diagnostics?: ReadonlyArray<Readonly<Record<string, unknown>>>
}>

export const MAX_ANTHROPIC_NATIVE_BLOCK_BYTES = 2 * 1024 * 1024
export const MAX_ANTHROPIC_NATIVE_SNAPSHOT_BYTES = 8 * 1024 * 1024

export class AnthropicProviderNativeValidationError extends ProviderNativeValidationError {
  constructor(message: string) {
    super(message)
    this.name = 'AnthropicProviderNativeValidationError'
  }
}

export function normalizeAnthropicProviderNativeSnapshot(value: unknown): AnthropicProviderNativeSnapshot {
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

  const content = normalizeAnthropicNativeContentBlocks(record.content)
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

  validateJsonByteLimit(normalized, MAX_ANTHROPIC_NATIVE_SNAPSHOT_BYTES, 'Anthropic native snapshot is too large')
  return normalized as AnthropicProviderNativeSnapshot
}

export function normalizeAnthropicNativeContentBlocks(value: unknown): AnthropicNativeContentBlock[] {
  const blocks = clonePlainJsonArray(value, '$.content')
  return blocks.map((block, index) => {
    const cloned = clonePlainJsonObject(block, `$.content[${index}]`)
    validateJsonByteLimit(cloned, MAX_ANTHROPIC_NATIVE_BLOCK_BYTES, `Anthropic native content block ${index} is too large`)
    return cloned
  })
}

export function isFinalAnthropicProviderNativeSnapshot(value: unknown): value is AnthropicProviderNativeSnapshot {
  try {
    const snapshot = normalizeAnthropicProviderNativeSnapshot(value)
    return snapshot.status === 'final'
  } catch {
    return false
  }
}

export function assertFinalAnthropicProviderNativeSnapshot(value: unknown): AnthropicProviderNativeSnapshot {
  const snapshot = normalizeAnthropicProviderNativeSnapshot(value)
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

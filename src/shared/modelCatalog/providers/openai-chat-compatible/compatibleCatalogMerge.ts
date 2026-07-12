import {
  OPENAI_CHAT_COMPATIBLE_PROTOCOL_KEY,
  compatibleModelIdSchema,
  providerInstanceIdSchema,
  type CompatibleMergedModel,
  type CompatibleModelMetadata,
  type CompatibleModelRecord,
} from '../../../provider/openai-chat-compatible'

const CAPABILITY_KEYS = ['text', 'vision', 'tools', 'structuredOutputs', 'reasoning'] as const
const PRICE_KEYS = ['prompt', 'completion', 'request', 'image'] as const

export function mergeCompatibleModelRecords(
  rawRecords: readonly CompatibleModelRecord[],
): readonly CompatibleMergedModel[] {
  const byModel = new Map<string, CompatibleModelRecord[]>()
  let providerInstanceId: ReturnType<typeof providerInstanceIdSchema.parse> | null = null
  for (const record of rawRecords) {
    const instanceId = providerInstanceIdSchema.parse(record.providerInstanceId)
    if (providerInstanceId !== null && providerInstanceId !== instanceId) {
      throw new Error('compatible_catalog_scope_mismatch')
    }
    providerInstanceId = instanceId
    const modelId = compatibleModelIdSchema.parse(record.modelId)
    const records = byModel.get(modelId) ?? []
    if (records.some((entry) => entry.source === record.source)) {
      throw new Error('compatible_catalog_source_duplicate')
    }
    records.push(record)
    byModel.set(modelId, records)
  }
  if (providerInstanceId === null) return Object.freeze([])

  return Object.freeze([...byModel.entries()]
    .map(([modelId, records]) => mergeOne(providerInstanceId!, modelId, records))
    .sort((left, right) => left.modelId.localeCompare(right.modelId, 'en', { sensitivity: 'base' })))
}

function mergeOne(
  providerInstanceId: ReturnType<typeof providerInstanceIdSchema.parse>,
  modelId: string,
  records: readonly CompatibleModelRecord[],
): CompatibleMergedModel {
  const remote = records.find((record) => record.source === 'remote_sync')
  const manual = records.find((record) => record.source === 'manual')
  const fieldProvenance: Record<string, 'remote_sync' | 'manual' | 'unknown'> = {}
  const conflictFields: string[] = []
  const pick = <T>(path: string, manualValue: T | null | undefined, remoteValue: T | null | undefined): T | null => {
    if (manualValue !== null && manualValue !== undefined) {
      if (remoteValue !== null && remoteValue !== undefined && JSON.stringify(manualValue) !== JSON.stringify(remoteValue)) conflictFields.push(path)
      fieldProvenance[path] = 'manual'
      return manualValue
    }
    if (remoteValue !== null && remoteValue !== undefined) {
      fieldProvenance[path] = 'remote_sync'
      return remoteValue
    }
    fieldProvenance[path] = 'unknown'
    return null
  }
  const metadata: CompatibleModelMetadata = {
    schemaVersion: 1,
    displayName: pick('displayName', manual?.metadata.displayName, remote?.metadata.displayName),
    contextLength: pick('contextLength', manual?.metadata.contextLength, remote?.metadata.contextLength),
    maxOutputTokens: pick('maxOutputTokens', manual?.metadata.maxOutputTokens, remote?.metadata.maxOutputTokens),
    capabilities: Object.fromEntries(CAPABILITY_KEYS.map((key) => [
      key,
      pick(`capabilities.${key}`, manual?.metadata.capabilities[key], remote?.metadata.capabilities[key]),
    ])) as CompatibleModelMetadata['capabilities'],
    pricing: Object.fromEntries(PRICE_KEYS.map((key) => [
      key,
      pick(`pricing.${key}`, manual?.metadata.pricing[key], remote?.metadata.pricing[key]),
    ])) as CompatibleModelMetadata['pricing'],
    fieldProvenance,
  }
  return Object.freeze({
    protocolKey: OPENAI_CHAT_COMPATIBLE_PROTOCOL_KEY,
    providerInstanceId,
    modelId,
    metadata: Object.freeze(metadata),
    availability: manual || remote?.state === 'active' ? 'active' : 'stale',
    sourcePresence: Object.freeze({
      remote: remote?.state ?? 'absent',
      manual: Boolean(manual),
    }),
    conflictFields: Object.freeze(conflictFields.sort()),
  })
}

import {
  OPENAI_CHAT_COMPATIBLE_PROTOCOL_KEY,
  compatibleModelIdSchema,
  providerInstanceIdSchema,
  type CompatibleCatalogSyncState,
  type CompatibleMergedModel,
} from '../../shared/provider/openai-chat-compatible'

export type CompatibleCatalogQueryResult = Readonly<{
  protocolKey: typeof OPENAI_CHAT_COMPATIBLE_PROTOCOL_KEY
  providerInstanceId: string
  providerName: string
  providerStatus: 'active' | 'disabled' | 'deleted'
  syncState: CompatibleCatalogSyncState | null
  total: number
  items: readonly CompatibleMergedModel[]
}>

export function buildCompatibleCatalogModelKey(input: Readonly<{ providerInstanceId: string; modelId: string }>): string {
  const providerInstanceId = providerInstanceIdSchema.parse(input.providerInstanceId)
  const modelId = compatibleModelIdSchema.parse(input.modelId)
  return `${OPENAI_CHAT_COMPATIBLE_PROTOCOL_KEY}:${encodeURIComponent(providerInstanceId)}:${encodeURIComponent(modelId)}`
}

export function createCompatibleCatalogClient(bridge: NonNullable<Window['compatibleCatalog']> | undefined = window.compatibleCatalog) {
  const requireMethod = <Name extends keyof NonNullable<Window['compatibleCatalog']>>(name: Name) => {
    const method = bridge?.[name]
    if (typeof method !== 'function') throw new Error('compatible_catalog_bridge_unavailable')
    return method as NonNullable<NonNullable<Window['compatibleCatalog']>[Name]>
  }
  return Object.freeze({
    query: async (input: Readonly<{
      providerInstanceId: string
      search?: string
      includeStale?: boolean
      offset?: number
      limit?: number
    }>): Promise<CompatibleCatalogQueryResult> => {
      const providerInstanceId = providerInstanceIdSchema.parse(input.providerInstanceId)
      const result = await requireMethod('query')({ ...input, providerInstanceId })
      if (result.protocolKey !== OPENAI_CHAT_COMPATIBLE_PROTOCOL_KEY || result.providerInstanceId !== providerInstanceId) {
        throw new Error('compatible_catalog_scope_mismatch')
      }
      return result as CompatibleCatalogQueryResult
    },
    sync: async (input: Readonly<{ providerInstanceId: string; requestId: string; force?: boolean }>) => {
      const providerInstanceId = providerInstanceIdSchema.parse(input.providerInstanceId)
      return requireMethod('sync')({ ...input, providerInstanceId })
    },
    abortSync: async (requestId: string) => requireMethod('abortSync')({ requestId }),
    getStatus: async (providerInstanceId: string) => requireMethod('getStatus')({
      providerInstanceId: providerInstanceIdSchema.parse(providerInstanceId),
    }),
    upsertManual: async (input: Readonly<{
      providerInstanceId: string
      modelId: string
      metadata: CompatibleCatalogManualMetadataInput
    }>) => requireMethod('upsertManual')({
      ...input,
      providerInstanceId: providerInstanceIdSchema.parse(input.providerInstanceId),
      modelId: compatibleModelIdSchema.parse(input.modelId),
    }),
    deleteManual: async (input: Readonly<{ providerInstanceId: string; modelId: string }>) => requireMethod('deleteManual')({
      providerInstanceId: providerInstanceIdSchema.parse(input.providerInstanceId),
      modelId: compatibleModelIdSchema.parse(input.modelId),
    }),
  })
}

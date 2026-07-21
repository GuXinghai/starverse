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

type CatalogBridge = NonNullable<NonNullable<Window['generationV2']>['openAICompatible']>

export function createCompatibleCatalogClient(bridge: CatalogBridge | undefined = window.generationV2?.openAICompatible) {
  const requireMethod = (name: string) => {
    const resolved = bridge ?? window.generationV2?.openAICompatible
    const method = (resolved as unknown as Record<string, unknown> | undefined)?.[name]
    if (typeof method !== 'function') throw new Error('compatible_catalog_bridge_unavailable')
    return method as (input: any) => Promise<any>
  }
  const call = async <T>(name: string, input: unknown): Promise<T> => {
    const result = await requireMethod(name)(input)
    if (!result || result.ok !== true) throw new Error(result?.code ?? 'compatible_catalog_unavailable')
    return result.value as T
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
      const result = await call<CompatibleCatalogQueryResult>('queryModels', { providerInstanceId,
        search: input.search ?? '', includeStale: input.includeStale ?? false, offset: input.offset ?? 0, limit: input.limit ?? 200 })
      if (result.protocolKey !== OPENAI_CHAT_COMPATIBLE_PROTOCOL_KEY || result.providerInstanceId !== providerInstanceId) {
        throw new Error('compatible_catalog_scope_mismatch')
      }
      return result as CompatibleCatalogQueryResult
    },
    sync: async (input: Readonly<{ providerInstanceId: string; requestId: string; force?: boolean }>) => {
      const providerInstanceId = providerInstanceIdSchema.parse(input.providerInstanceId)
      return call('syncModels', { providerInstanceId, requestId: input.requestId, force: input.force ?? false })
    },
    abortSync: async (requestId: string) => call('abortModelSync', requestId),
    getStatus: async (providerInstanceId: string) => {
      const id = providerInstanceIdSchema.parse(providerInstanceId)
      return call('getModelStatus', id)
    },
    upsertManual: async (input: Readonly<{
      providerInstanceId: string
      modelId: string
      metadata: CompatibleCatalogManualMetadataInput
    }>) => call('upsertManualModel', {
      ...input,
      providerInstanceId: providerInstanceIdSchema.parse(input.providerInstanceId),
      modelId: compatibleModelIdSchema.parse(input.modelId),
    }),
    deleteManual: async (input: Readonly<{ providerInstanceId: string; modelId: string }>) => call('deleteManualModel', {
      providerInstanceId: providerInstanceIdSchema.parse(input.providerInstanceId),
      modelId: compatibleModelIdSchema.parse(input.modelId),
    }),
  })
}

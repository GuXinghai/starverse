import { z } from 'zod'
import type { DbMethod } from '../../infra/db/dbMethodsRegistry'
import {
  compatibleModelIdSchema,
  compatibleModelMetadataSchema,
  providerInstanceIdSchema,
  type CompatibleCatalogSyncState,
  type CompatibleMergedModel,
  type CompatibleProviderInstance,
} from '../../src/shared/provider/openai-chat-compatible'
import { buildCompatibleNetworkError } from '../../src/shared/network/compatibleNetworkError'
import type { CompatibleCatalogSyncService } from '../modelCatalog/compatibleCatalogSyncJob'
import type { RegisterInvoke } from './types'

export const COMPATIBLE_CATALOG_CHANNELS = [
  'compatible-catalog:sync',
  'compatible-catalog:abort-sync',
  'compatible-catalog:query',
  'compatible-catalog:get-status',
  'compatible-catalog:upsert-manual',
  'compatible-catalog:delete-manual',
] as const

const requestIdSchema = z.string().trim().min(1).max(128).regex(/^[A-Za-z0-9._:-]+$/u)
const syncInputSchema = z.object({
  providerInstanceId: providerInstanceIdSchema,
  requestId: requestIdSchema,
  force: z.boolean().default(false),
}).strict()
const abortInputSchema = z.object({ requestId: requestIdSchema }).strict()
const queryInputSchema = z.object({
  providerInstanceId: providerInstanceIdSchema,
  search: z.string().trim().max(256).default(''),
  includeStale: z.boolean().default(false),
  offset: z.number().int().nonnegative().max(100_000).default(0),
  limit: z.number().int().positive().max(200).default(100),
}).strict()
const manualMetadataInputSchema = compatibleModelMetadataSchema.omit({ fieldProvenance: true })
const upsertManualInputSchema = z.object({
  providerInstanceId: providerInstanceIdSchema,
  modelId: compatibleModelIdSchema,
  metadata: manualMetadataInputSchema,
}).strict()
const deleteManualInputSchema = z.object({ providerInstanceId: providerInstanceIdSchema, modelId: compatibleModelIdSchema }).strict()
const providerInputSchema = z.object({ providerInstanceId: providerInstanceIdSchema }).strict()

type DbCaller = Readonly<{ call: (method: DbMethod, params?: unknown) => Promise<unknown> }>

export type CompatibleCatalogService = Readonly<{
  sync: CompatibleCatalogSyncService['sync']
  abortSync: CompatibleCatalogSyncService['abortSync']
  abortOwner: CompatibleCatalogSyncService['abortOwner']
  query: (input: z.input<typeof queryInputSchema>) => Promise<Readonly<{
    protocolKey: 'openai_chat_compatible'
    providerInstanceId: string
    providerName: string
    providerStatus: CompatibleProviderInstance['status']
    syncState: CompatibleCatalogSyncState | null
    total: number
    items: readonly CompatibleMergedModel[]
  }>>
  getStatus: (providerInstanceId: string) => Promise<CompatibleCatalogSyncState | null>
  upsertManual: (input: z.input<typeof upsertManualInputSchema>) => Promise<CompatibleMergedModel>
  deleteManual: (input: z.input<typeof deleteManualInputSchema>) => Promise<Readonly<{ deleted: boolean }>>
}>

export function createCompatibleCatalogService(input: Readonly<{
  db: DbCaller
  sync: CompatibleCatalogSyncService
  nowMs?: () => number
}>): CompatibleCatalogService {
  const nowMs = input.nowMs ?? Date.now
  const assertProvider = async (providerInstanceId: string): Promise<CompatibleProviderInstance> => {
    const provider = await input.db.call('compatibleProvider.get', { providerInstanceId }) as CompatibleProviderInstance | null
    if (!provider) throw new Error('compatible_config_invalid')
    return provider
  }
  return {
    sync: input.sync.sync,
    abortSync: input.sync.abortSync,
    abortOwner: input.sync.abortOwner,
    query: async (raw) => {
      const value = queryInputSchema.parse(raw)
      const provider = await assertProvider(value.providerInstanceId)
      const all = await input.db.call('compatibleCatalog.listMergedModels', { providerInstanceId: value.providerInstanceId }) as readonly CompatibleMergedModel[]
      const needle = value.search.toLocaleLowerCase('en-US')
      const filtered = all.filter((model) => {
        if (!value.includeStale && model.availability === 'stale') return false
        if (!needle) return true
        return model.modelId.toLocaleLowerCase('en-US').includes(needle) ||
          (model.metadata.displayName ?? '').toLocaleLowerCase('en-US').includes(needle)
      })
      const syncState = await input.db.call('compatibleCatalog.getSyncState', { providerInstanceId: value.providerInstanceId }) as CompatibleCatalogSyncState | null
      return Object.freeze({
        protocolKey: 'openai_chat_compatible' as const,
        providerInstanceId: value.providerInstanceId,
        providerName: provider.displayName,
        providerStatus: provider.status,
        syncState,
        total: filtered.length,
        items: Object.freeze(filtered.slice(value.offset, value.offset + value.limit)),
      })
    },
    getStatus: async (providerInstanceId) => {
      const id = providerInstanceIdSchema.parse(providerInstanceId)
      await assertProvider(id)
      return await input.db.call('compatibleCatalog.getSyncState', { providerInstanceId: id }) as CompatibleCatalogSyncState | null
    },
    upsertManual: async (raw) => {
      const value = upsertManualInputSchema.parse(raw)
      const provider = await assertProvider(value.providerInstanceId)
      if (provider.status !== 'active') throw new Error('compatible_config_invalid')
      await input.db.call('compatibleCatalog.upsertManualModel', {
        ...value,
        metadata: { ...value.metadata, fieldProvenance: manualFieldProvenance(value.metadata) },
        updatedAtMs: nowMs(),
      })
      const merged = await input.db.call('compatibleCatalog.listMergedModels', { providerInstanceId: value.providerInstanceId }) as readonly CompatibleMergedModel[]
      const result = merged.find((model) => model.modelId === value.modelId)
      if (!result) throw new Error('compatible_config_invalid')
      return result
    },
    deleteManual: async (raw) => {
      const value = deleteManualInputSchema.parse(raw)
      const provider = await assertProvider(value.providerInstanceId)
      if (provider.status !== 'active') throw new Error('compatible_config_invalid')
      return await input.db.call('compatibleCatalog.deleteManualModel', value) as Readonly<{ deleted: boolean }>
    },
  }
}

type SenderLike = Readonly<{
  id: number
  once: (event: 'destroyed', listener: () => void) => unknown
  removeListener: (event: 'destroyed', listener: () => void) => unknown
}>

export function registerCompatibleCatalogIpc(input: Readonly<{
  registerInvoke: RegisterInvoke
  service: CompatibleCatalogService
}>): string[] {
  input.registerInvoke('compatible-catalog:sync', async (event, raw) => {
    const command = syncInputSchema.safeParse(raw)
    const sender = senderFromEvent(event)
    if (!command.success || !sender) return invalidSyncResult()
    const onDestroyed = () => { input.service.abortOwner(sender.id) }
    sender.once('destroyed', onDestroyed)
    try {
      return await input.service.sync({ ...command.data, ownerWebContentsId: sender.id })
    } finally {
      sender.removeListener('destroyed', onDestroyed)
    }
  })
  input.registerInvoke('compatible-catalog:abort-sync', (event, raw) => {
    const command = abortInputSchema.safeParse(raw)
    const sender = senderFromEvent(event)
    if (!command.success || !sender) return { aborted: false }
    return input.service.abortSync({ ...command.data, ownerWebContentsId: sender.id })
  })
  input.registerInvoke('compatible-catalog:query', async (_event, raw) => input.service.query(queryInputSchema.parse(raw)))
  input.registerInvoke('compatible-catalog:get-status', async (_event, raw) => {
    const value = providerInputSchema.parse(raw)
    return input.service.getStatus(value.providerInstanceId)
  })
  input.registerInvoke('compatible-catalog:upsert-manual', async (_event, raw) => input.service.upsertManual(upsertManualInputSchema.parse(raw)))
  input.registerInvoke('compatible-catalog:delete-manual', async (_event, raw) => input.service.deleteManual(deleteManualInputSchema.parse(raw)))
  return [...COMPATIBLE_CATALOG_CHANNELS]
}

function manualFieldProvenance(metadata: z.infer<typeof manualMetadataInputSchema>): Record<string, 'manual'> {
  const output: Record<string, 'manual'> = {}
  if (metadata.displayName !== null) output.displayName = 'manual'
  if (metadata.contextLength !== null) output.contextLength = 'manual'
  if (metadata.maxOutputTokens !== null) output.maxOutputTokens = 'manual'
  for (const [key, value] of Object.entries(metadata.capabilities)) if (value !== null) output[`capabilities.${key}`] = 'manual'
  for (const [key, value] of Object.entries(metadata.pricing)) if (value !== null) output[`pricing.${key}`] = 'manual'
  return output
}

function senderFromEvent(event: unknown): SenderLike | null {
  const sender = event && typeof event === 'object' && 'sender' in event ? (event as { sender?: unknown }).sender : null
  if (!sender || typeof sender !== 'object') return null
  const candidate = sender as Partial<SenderLike>
  return Number.isInteger(candidate.id) && Number(candidate.id) >= 1 && typeof candidate.once === 'function' && typeof candidate.removeListener === 'function'
    ? candidate as SenderLike
    : null
}

function invalidSyncResult() {
  return Object.freeze({
    ok: false as const,
    requestId: 'invalid',
    providerInstanceId: 'invalid',
    error: buildCompatibleNetworkError({ code: 'compatible_config_invalid', stage: 'request' }),
    syncState: null,
  })
}

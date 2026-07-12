import { describe, expect, it, vi } from 'vitest'
import type { CompatibleMergedModel } from '../../src/shared/provider/openai-chat-compatible'
import { createCompatibleCatalogService, registerCompatibleCatalogIpc } from './compatibleCatalogIpc'

const metadata = (displayName: string | null = null) => ({
  schemaVersion: 1 as const,
  displayName,
  contextLength: null,
  maxOutputTokens: null,
  capabilities: { text: null, vision: null, tools: null, structuredOutputs: null, reasoning: null },
  pricing: { prompt: null, completion: null, request: null, image: null },
  fieldProvenance: {},
})

const model = (modelId: string, availability: 'active' | 'stale', displayName: string | null = null): CompatibleMergedModel => ({
  protocolKey: 'openai_chat_compatible',
  providerInstanceId: 'ocp_provider_12345678' as CompatibleMergedModel['providerInstanceId'],
  modelId,
  availability,
  metadata: metadata(displayName),
  sourcePresence: { remote: availability, manual: false },
  conflictFields: [],
})

function dependencies(status: 'active' | 'deleted' = 'active') {
  let models: CompatibleMergedModel[] = [model('alpha', 'active', 'First'), model('stale-model', 'stale')]
  const db = { call: vi.fn(async (method: string, params: any) => {
    if (method === 'compatibleProvider.get') return {
      providerInstanceId: params.providerInstanceId, protocolKey: 'openai_chat_compatible', displayName: 'Instance A',
      status, createdAtMs: 1, updatedAtMs: 1, deletedAtMs: status === 'deleted' ? 2 : null,
    }
    if (method === 'compatibleCatalog.listMergedModels') return models
    if (method === 'compatibleCatalog.getSyncState') return null
    if (method === 'compatibleCatalog.upsertManualModel') {
      expect(params.metadata.fieldProvenance).toEqual({ displayName: 'manual', 'capabilities.tools': 'manual' })
      models = [model(params.modelId, 'active', params.metadata.displayName)]
      return {}
    }
    if (method === 'compatibleCatalog.deleteManualModel') return { deleted: true }
    throw new Error(`unexpected ${method}`)
  }) }
  const sync = {
    sync: vi.fn(async (input) => ({ ok: true, ...input })),
    abortSync: vi.fn(() => ({ aborted: true })),
    abortOwner: vi.fn(() => 1),
    abortAll: vi.fn(() => 1),
  }
  return { db, sync }
}

describe('compatibleCatalogIpc', () => {
  it('queries one instance-scoped merged source and excludes stale rows by default', async () => {
    const deps = dependencies()
    const service = createCompatibleCatalogService({ ...deps as any })
    await expect(service.query({ providerInstanceId: 'ocp_provider_12345678', search: '', includeStale: false, offset: 0, limit: 100 }))
      .resolves.toMatchObject({
        protocolKey: 'openai_chat_compatible', providerInstanceId: 'ocp_provider_12345678', providerName: 'Instance A',
        total: 1, items: [{ modelId: 'alpha', availability: 'active' }],
      })
    await expect(service.query({ providerInstanceId: 'ocp_provider_12345678', search: 'stale', includeStale: true, offset: 0, limit: 100 }))
      .resolves.toMatchObject({ total: 1, items: [{ modelId: 'stale-model', availability: 'stale' }] })
  })

  it('derives manual provenance in main and never accepts caller-provided provenance', async () => {
    const deps = dependencies()
    const service = createCompatibleCatalogService({ ...deps as any, nowMs: () => 10 })
    await expect(service.upsertManual({
      providerInstanceId: 'ocp_provider_12345678', modelId: 'manual-model',
      metadata: {
        schemaVersion: 1, displayName: 'Manual', contextLength: null, maxOutputTokens: null,
        capabilities: { text: null, vision: null, tools: true, structuredOutputs: null, reasoning: null },
        pricing: { prompt: null, completion: null, request: null, image: null },
      },
    })).resolves.toMatchObject({ modelId: 'manual-model', metadata: { displayName: 'Manual' } })
  })

  it('keeps tombstoned catalog queryable for diagnostics but blocks manual mutation', async () => {
    const deps = dependencies('deleted')
    const service = createCompatibleCatalogService({ ...deps as any })
    await expect(service.query({ providerInstanceId: 'ocp_provider_12345678', search: '', includeStale: true, offset: 0, limit: 100 }))
      .resolves.toMatchObject({ providerStatus: 'deleted', total: 2 })
    await expect(service.deleteManual({ providerInstanceId: 'ocp_provider_12345678', modelId: 'alpha' }))
      .rejects.toThrow('compatible_config_invalid')
  })

  it('binds sync and abort to sender ownership with no renderer network configuration', async () => {
    const deps = dependencies()
    const service = createCompatibleCatalogService({ ...deps as any })
    const handlers = new Map<string, Function>()
    registerCompatibleCatalogIpc({ registerInvoke: (channel, handler) => { handlers.set(channel, handler) }, service })
    const sender = { id: 7, once: vi.fn(), removeListener: vi.fn() }
    const syncResult = await handlers.get('compatible-catalog:sync')?.({ sender }, {
      providerInstanceId: 'ocp_provider_12345678', requestId: 'sync-1', force: true,
    })
    expect(syncResult).toMatchObject({ ok: true, ownerWebContentsId: 7 })
    expect(deps.sync.sync).toHaveBeenCalledWith({
      providerInstanceId: 'ocp_provider_12345678', requestId: 'sync-1', force: true, ownerWebContentsId: 7,
    })
    expect(JSON.stringify(deps.sync.sync.mock.calls)).not.toMatch(/baseUrl|credential|headers|query|body/iu)
    expect(await handlers.get('compatible-catalog:abort-sync')?.({ sender }, { requestId: 'sync-1' })).toEqual({ aborted: true })
  })
})

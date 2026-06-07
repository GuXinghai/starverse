import { afterEach, describe, expect, it, vi } from 'vitest'
import { listScopedCurrentModelCatalog } from './modelCatalogClient'

describe('listScopedCurrentModelCatalog', () => {
  const originalDbBridge = (globalThis as any).dbBridge
  const originalElectronAPI = (globalThis as any).electronAPI

  afterEach(() => {
    ;(globalThis as any).dbBridge = originalDbBridge
    ;(globalThis as any).electronAPI = originalElectronAPI
    vi.restoreAllMocks()
  })

  it('lists current scoped active rows without calling legacy catalog IPC', async () => {
    const legacyInvoke = vi.fn(async () => {
      throw new Error('legacy catalog IPC should not be called')
    })
    const scopedQuery = vi
      .fn()
      .mockResolvedValueOnce({
        status: 'synced',
        catalogRevision: 'checksum-a',
        modelCount: 2,
        items: [
          {
            providerKey: 'openrouter',
            modelId: 'a/model',
            modelKey: 'openrouter::a/model',
            canonicalSlug: 'a/model',
            displayName: 'A Model',
            vendor: 'vendor-a',
            visibility: 'visible',
            supportedParameters: ['reasoning'],
            pricing: {},
            capabilities: {
              reasoning: true,
              tools: false,
              structuredOutputs: false,
              vision: false,
              longContext: false,
            },
          },
        ],
        nextCursor: {
          sortBy: 'name',
          sortOrder: 'asc',
          name: 'A Model',
          modelKey: 'openrouter::a/model',
        },
      })
      .mockResolvedValueOnce({
        status: 'synced',
        catalogRevision: 'checksum-a',
        modelCount: 2,
        items: [
          {
            providerKey: 'openrouter',
            modelId: 'b/model',
            modelKey: 'openrouter::b/model',
            canonicalSlug: 'b/model',
            displayName: 'B Model',
            vendor: 'vendor-b',
            visibility: 'visible',
            supportedParameters: ['tools'],
            pricing: {},
            capabilities: {
              reasoning: false,
              tools: true,
              structuredOutputs: false,
              vision: false,
              longContext: false,
            },
          },
        ],
        nextCursor: null,
      })
    ;(globalThis as any).dbBridge = { invoke: legacyInvoke }
    ;(globalThis as any).electronAPI = { modelCatalogQueryScopedCurrent: scopedQuery }

    const result = await listScopedCurrentModelCatalog('openrouter')

    expect(result).toMatchObject({
      status: 'synced',
      catalogRevision: 'checksum-a',
      modelCount: 2,
      items: [
        {
          modelId: 'a/model',
          name: 'A Model',
          vendor: 'vendor-a',
          status: 'visible',
          supportedParameters: ['reasoning'],
        },
        {
          modelId: 'b/model',
          name: 'B Model',
          vendor: 'vendor-b',
          status: 'visible',
          supportedParameters: ['tools'],
        },
      ],
    })
    expect(scopedQuery).toHaveBeenCalledTimes(2)
    expect(scopedQuery).toHaveBeenNthCalledWith(1, expect.objectContaining({
      providerKey: 'openrouter',
      limit: 100,
      cursor: null,
    }))
    expect(legacyInvoke).not.toHaveBeenCalled()
    expect(JSON.stringify(scopedQuery.mock.calls)).not.toContain('sk-')
    expect(JSON.stringify(scopedQuery.mock.calls)).not.toContain('catalogScopeKey')
  })

  it('does not fall back to legacy rows when scoped IPC is unavailable', async () => {
    const legacyInvoke = vi.fn(async (method: string) => {
      if (method === 'modelCatalog.list') {
        return [{ modelId: 'legacy/only-model', name: 'Legacy Only', vendor: 'legacy' }]
      }
      return []
    })
    ;(globalThis as any).dbBridge = { invoke: legacyInvoke }
    ;(globalThis as any).electronAPI = undefined

    const result = await listScopedCurrentModelCatalog('openrouter')

    expect(result.items).toEqual([])
    expect(result.status).toBeUndefined()
    expect(legacyInvoke).not.toHaveBeenCalled()
  })
})

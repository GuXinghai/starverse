import { describe, expect, it, vi } from 'vitest'
import type { DbHandler, DbMethod } from './types'
import { DB_WORKER_METHODS, assertDbMethodCoverage } from './dbMethodsRegistry'
import { registerProjectHandlers } from './worker/handlers/projectHandlers'
import { registerConvoMessageHandlers } from './worker/handlers/convoMessageHandlers'
import { registerBranchContextHandlers } from './worker/handlers/branchContextHandlers'
import { registerSearchMaintenanceHandlers } from './worker/handlers/searchMaintenanceHandlers'
import { registerUsagePrefsSettingsHandlers } from './worker/handlers/usagePrefsSettingsHandlers'

describe('DbWorker handler registration modules', () => {
  it('register modules fully cover DB_WORKER_METHODS', () => {
    const handlers = new Map<DbMethod, DbHandler>()
    const register = (method: DbMethod, handler: DbHandler) => {
      handlers.set(method, handler)
    }

    const runtime = {} as any
    registerProjectHandlers(register, runtime)
    registerConvoMessageHandlers(register, runtime)
    registerBranchContextHandlers(register, runtime)
    registerSearchMaintenanceHandlers(register, runtime)
    registerUsagePrefsSettingsHandlers(register, runtime)

    expect(() => {
      assertDbMethodCoverage(
        'DbWorkerRuntime.registerHandlers(modularized)',
        DB_WORKER_METHODS,
        handlers.keys()
      )
    }).not.toThrow()
    expect(handlers.size).toBe(DB_WORKER_METHODS.length)
  })

  it('keeps representative handler routing behavior', () => {
    const handlers = new Map<DbMethod, DbHandler>()
    const register = (method: DbMethod, handler: DbHandler) => {
      handlers.set(method, handler)
    }

    const projectListSpy = vi.fn(() => [{ id: 'p1', name: 'default' }])
    const usageAggregateSpy = vi.fn((input: { days?: number }) => ({ total: input.days ?? 0 }))
    const modelCatalogQuerySpy = vi.fn(() => ({ items: [], nextCursor: null }))
    const modelCatalogGetModelDetailSpy = vi.fn(() => null)
    const modelCatalogReplaceEndpointMetaSpy = vi.fn(() => undefined)
    const modelCatalogListEndpointMetaSpy = vi.fn(() => [])
    const modelPrefsListFavoritesSpy = vi.fn(() => [])
    const modelPrefsAddFavoriteSpy = vi.fn(() => ({ modelKey: 'openrouter::openai/gpt-4o', sortRank: 0 }))
    const modelPrefsRemoveFavoriteSpy = vi.fn(() => ({ removed: 1 }))
    const modelPrefsReorderFavoritesSpy = vi.fn(() => [])
    const modelPrefsListRecentsSpy = vi.fn(() => [])
    const modelPrefsRecordRecentSpy = vi.fn(() => ({ modelKey: 'openrouter::openai/gpt-4o', useCount: 1 }))

    const runtime = {
      projectRepo: {
        list: projectListSpy,
      },
      usageRepo: {
        aggregateUsage: usageAggregateSpy,
      },
      modelCatalogRepo: {
        queryCore: modelCatalogQuerySpy,
        getCoreModelDetail: modelCatalogGetModelDetailSpy,
        replaceEndpointMetaByModel: modelCatalogReplaceEndpointMetaSpy,
        listEndpointMetaByModel: modelCatalogListEndpointMetaSpy,
      },
      modelPreferencesRepo: {
        listFavorites: modelPrefsListFavoritesSpy,
        addFavorite: modelPrefsAddFavoriteSpy,
        removeFavorite: modelPrefsRemoveFavoriteSpy,
        reorderFavorites: modelPrefsReorderFavoritesSpy,
        listRecents: modelPrefsListRecentsSpy,
        recordRecent: modelPrefsRecordRecentSpy,
      },
    } as any

    registerProjectHandlers(register, runtime)
    registerUsagePrefsSettingsHandlers(register, runtime)

    const projectList = handlers.get('project.list')
    const usageAggregate = handlers.get('usage.aggregate')
    const modelCatalogQuery = handlers.get('modelCatalog.queryCore')
    const modelCatalogGetModelDetail = handlers.get('modelCatalog.getModelDetail')
    const modelCatalogReplaceEndpointMeta = handlers.get('modelCatalog.replaceEndpointMeta')
    const modelCatalogListEndpointMeta = handlers.get('modelCatalog.listEndpointMeta')
    const modelPrefsListFavorites = handlers.get('modelPrefs.listFavorites')
    const modelPrefsAddFavorite = handlers.get('modelPrefs.addFavorite')
    const modelPrefsRemoveFavorite = handlers.get('modelPrefs.removeFavorite')
    const modelPrefsReorderFavorites = handlers.get('modelPrefs.reorderFavorites')
    const modelPrefsListRecents = handlers.get('modelPrefs.listRecents')
    const modelPrefsRecordRecent = handlers.get('modelPrefs.recordRecent')
    expect(projectList).toBeTypeOf('function')
    expect(usageAggregate).toBeTypeOf('function')
    expect(modelCatalogQuery).toBeTypeOf('function')
    expect(modelCatalogGetModelDetail).toBeTypeOf('function')
    expect(modelCatalogReplaceEndpointMeta).toBeTypeOf('function')
    expect(modelCatalogListEndpointMeta).toBeTypeOf('function')
    expect(modelPrefsListFavorites).toBeTypeOf('function')
    expect(modelPrefsAddFavorite).toBeTypeOf('function')
    expect(modelPrefsRemoveFavorite).toBeTypeOf('function')
    expect(modelPrefsReorderFavorites).toBeTypeOf('function')
    expect(modelPrefsListRecents).toBeTypeOf('function')
    expect(modelPrefsRecordRecent).toBeTypeOf('function')

    expect(projectList!({ includeSystem: true })).toEqual([{ id: 'p1', name: 'default' }])
    expect(usageAggregate!({ days: 7 })).toEqual({ total: 0 })
    expect(modelCatalogQuery!({ providerKey: 'openrouter', sortBy: 'created_at' })).toEqual({ items: [], nextCursor: null })
    expect(modelCatalogQuery!({ providerKey: 'openrouter', sortBy: 'context_length' })).toEqual({ items: [], nextCursor: null })
    expect(modelCatalogGetModelDetail!({ providerKey: 'openrouter', modelId: 'openai/gpt-4' })).toBeNull()
    expect(modelCatalogReplaceEndpointMeta!({
      providerKey: 'openrouter',
      baseUrl: 'https://openrouter.ai/api/v1',
      modelId: 'openai/gpt-4',
      fetchedAtMs: Date.now(),
      endpoints: [{ endpointKey: 'k1' }],
    })).toEqual({ ok: true })
    expect(modelCatalogListEndpointMeta!({
      providerKey: 'openrouter',
      baseUrl: 'https://openrouter.ai/api/v1',
      modelId: 'openai/gpt-4',
    })).toEqual([])
    expect(modelPrefsListFavorites!({ scopeType: 'global', scopeId: '' })).toEqual([])
    expect(
      modelPrefsAddFavorite!({ scopeType: 'global', scopeId: '', modelKey: 'openrouter::openai/gpt-4o' })
    ).toEqual({ modelKey: 'openrouter::openai/gpt-4o', sortRank: 0 })
    expect(
      modelPrefsRemoveFavorite!({ scopeType: 'global', scopeId: '', modelKey: 'openrouter::openai/gpt-4o' })
    ).toEqual({ removed: 1 })
    expect(
      modelPrefsReorderFavorites!({
        scopeType: 'global',
        scopeId: '',
        orderedModelKeys: ['openrouter::openai/gpt-4o'],
      })
    ).toEqual({ items: [] })
    expect(modelPrefsListRecents!({ scopeType: 'global', scopeId: '', limit: 20 })).toEqual([])
    expect(
      modelPrefsRecordRecent!({ scopeType: 'global', scopeId: '', modelKey: 'openrouter::openai/gpt-4o' })
    ).toEqual({ modelKey: 'openrouter::openai/gpt-4o', useCount: 1 })
    expect(projectListSpy).toHaveBeenCalledTimes(1)
    expect(projectListSpy).toHaveBeenCalledWith({})
    expect(usageAggregateSpy).toHaveBeenCalledWith({})
    expect(modelCatalogQuerySpy).toHaveBeenCalledWith(expect.objectContaining({
      providerKey: 'openrouter',
      sortBy: 'created_at',
      sortOrder: 'asc',
    }))
    expect(modelCatalogQuerySpy).toHaveBeenCalledWith(expect.objectContaining({
      providerKey: 'openrouter',
      sortBy: 'context_length',
      sortOrder: 'asc',
    }))
    expect(modelCatalogGetModelDetailSpy).toHaveBeenCalledWith('openrouter', 'openai/gpt-4')
    expect(modelCatalogReplaceEndpointMetaSpy).toHaveBeenCalledWith(expect.objectContaining({
      providerKey: 'openrouter',
      baseUrl: 'https://openrouter.ai/api/v1',
      modelId: 'openai/gpt-4',
    }))
    expect(modelCatalogListEndpointMetaSpy).toHaveBeenCalledWith(
      'openrouter',
      'https://openrouter.ai/api/v1',
      'openai/gpt-4'
    )
    expect(modelPrefsListFavoritesSpy).toHaveBeenCalledWith(expect.objectContaining({ scopeType: 'global' }))
    expect(modelPrefsAddFavoriteSpy).toHaveBeenCalledWith(expect.objectContaining({ modelKey: 'openrouter::openai/gpt-4o' }))
    expect(modelPrefsRemoveFavoriteSpy).toHaveBeenCalledWith(expect.objectContaining({ modelKey: 'openrouter::openai/gpt-4o' }))
    expect(modelPrefsReorderFavoritesSpy).toHaveBeenCalledWith(expect.objectContaining({ orderedModelKeys: ['openrouter::openai/gpt-4o'] }))
    expect(modelPrefsListRecentsSpy).toHaveBeenCalledWith(expect.objectContaining({ limit: 20 }))
    expect(modelPrefsRecordRecentSpy).toHaveBeenCalledWith(expect.objectContaining({ modelKey: 'openrouter::openai/gpt-4o' }))
  })
})

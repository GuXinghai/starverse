import { describe, expect, it, vi } from 'vitest'
import type { DbHandler, DbMethod } from './types'
import { DB_WORKER_METHODS, assertDbMethodCoverage } from './dbMethodsRegistry'
import { registerProjectHandlers } from './worker/handlers/projectHandlers'
import { registerConvoMessageHandlers } from './worker/handlers/convoMessageHandlers'
import { registerBranchContextHandlers } from './worker/handlers/branchContextHandlers'
import { registerFilePipelineHandlers } from './worker/handlers/filePipelineHandlers'
import { registerEnginePluginLifecycleHandlers } from './worker/handlers/enginePluginLifecycleHandlers'
import { registerSearchMaintenanceHandlers } from './worker/handlers/searchMaintenanceHandlers'
import { registerUsagePrefsSettingsHandlers } from './worker/handlers/usagePrefsSettingsHandlers'
import { dispatchWorkerMessage } from './worker/router'

type HandlerHarness = Readonly<{
  handlers: Map<DbMethod, DbHandler>
  register: (method: DbMethod, handler: DbHandler) => void
}>

function createHarness(): HandlerHarness {
  const handlers = new Map<DbMethod, DbHandler>()
  return {
    handlers,
    register: (method, handler) => handlers.set(method, handler),
  }
}

function registerAllWorkerHandlerModules(harness: HandlerHarness, runtime: any) {
  registerProjectHandlers(harness.register, runtime)
  registerConvoMessageHandlers(harness.register, runtime)
  registerFilePipelineHandlers(harness.register, runtime)
  registerEnginePluginLifecycleHandlers(harness.register, runtime)
  registerBranchContextHandlers(harness.register, runtime)
  registerSearchMaintenanceHandlers(harness.register, runtime)
  registerUsagePrefsSettingsHandlers(harness.register, runtime)
}

function expectHandlersPresent(handlers: ReadonlyMap<DbMethod, DbHandler>, methods: readonly DbMethod[]) {
  for (const method of methods) {
    expect(handlers.get(method), method).toBeTypeOf('function')
  }
}

function createRepresentativeRuntime() {
  const spies = {
    projectList: vi.fn(() => [{ id: 'p1', name: 'default' }]),
    usageAggregate: vi.fn((input: { days?: number }) => ({ total: input.days ?? 0 })),
    modelCatalogQueryScopedActive: vi.fn(() => ({ items: [], nextCursor: null })),
    modelCatalogClearScopedCatalog: vi.fn(() => ({ deleted: {}, deletedScopeCount: 1 })),
    modelCatalogClearAllProviderScopedCatalog: vi.fn(() => ({ deleted: {}, deletedScopeCount: 2 })),
    modelCatalogCleanupExpiredScopedCatalogCaches: vi.fn(() => ({ deleted: {}, deletedScopeCount: 1 })),
    modelCatalogClearDeprecatedOpenRouterCatalogCache: vi.fn(() => ({ deleted: {}, deletedScopeCount: 0 })),
    modelPrefsListFavorites: vi.fn(() => []),
    modelPrefsAddFavorite: vi.fn(() => ({ modelKey: 'openrouter::openai/gpt-4o', sortRank: 0 })),
    modelPrefsRemoveFavorite: vi.fn(() => ({ removed: 1 })),
    modelPrefsReorderFavorites: vi.fn(() => []),
    modelPrefsListRecents: vi.fn(() => []),
    modelPrefsRecordRecent: vi.fn(() => ({ modelKey: 'openrouter::openai/gpt-4o', useCount: 1 })),
  }
  const runtime = {
    projectRepo: { list: spies.projectList },
    usageRepo: { aggregateUsage: spies.usageAggregate },
    modelCatalogRepo: {
      queryScopedActiveModels: spies.modelCatalogQueryScopedActive,
      clearScopedCatalog: spies.modelCatalogClearScopedCatalog,
      clearAllProviderScopedCatalog: spies.modelCatalogClearAllProviderScopedCatalog,
      cleanupExpiredScopedCatalogCaches: spies.modelCatalogCleanupExpiredScopedCatalogCaches,
      clearDeprecatedOpenRouterCatalogCache: spies.modelCatalogClearDeprecatedOpenRouterCatalogCache,
    },
    modelPreferencesRepo: {
      listFavorites: spies.modelPrefsListFavorites,
      addFavorite: spies.modelPrefsAddFavorite,
      removeFavorite: spies.modelPrefsRemoveFavorite,
      reorderFavorites: spies.modelPrefsReorderFavorites,
      listRecents: spies.modelPrefsListRecents,
      recordRecent: spies.modelPrefsRecordRecent,
    },
  } as any
  return { runtime, spies }
}

function createLifecycleRuntime() {
  const spies = {
    listOfficialPlugins: vi.fn(() => Promise.resolve({ ok: true, value: [] })),
    getInstalledPlugins: vi.fn(() => []),
    getDiagnosticsSummary: vi.fn(() => ({
      engines: [],
      counts: { total: 0, installed: 0, enabled: 0, healthy: 0, failed: 0, unverified: 0 },
    })),
    enablePlugin: vi.fn(() => Promise.resolve({
      ok: true,
      value: { engineId: 'magika', enabled: true, installState: 'installed' },
    })),
    disablePlugin: vi.fn(() => ({
      ok: true,
      value: { engineId: 'magika', enabled: false, installState: 'installed' },
    })),
    uninstallPlugin: vi.fn(() => ({
      ok: true,
      value: { engineId: 'magika', enabled: false, installState: 'uninstalled' },
    })),
    runHealthCheck: vi.fn(() => Promise.resolve({
      ok: true,
      value: { engineId: 'magika', healthStatus: 'healthy' },
    })),
    installOfficialPlugin: vi.fn(() => Promise.resolve({
      ok: true,
      value: {
        operationId: 'official-install-magika-0.1.0-1',
        pluginId: 'magika',
        pluginVersion: '0.1.0',
        operationType: 'official_install',
        source: 'official_builtin',
        state: 'pending',
        phase: 'pending',
        phaseLabel: 'Preparing install',
        progressSummary: 'Preparing install',
        stateHistory: ['accepted', 'pending'],
        startedAt: 1,
        updatedAt: 1,
        terminalAt: null,
        failureReason: null,
        diagnosticCode: null,
        sanitizedDiagnostics: [],
        installedEngineId: null,
        result: null,
      },
    })),
    getInstallOperationStatus: vi.fn(() => ({
      ok: true,
      value: null,
    })),
    registerLocalOfficialPlugin: vi.fn(() => Promise.resolve({
      ok: false,
      reason: 'already_registered',
      message: 'official plugin is already registered',
    })),
    registerLocalPackage: vi.fn(() => Promise.resolve({
      ok: false,
      reason: 'already_registered',
      message: 'plugin is already registered',
    })),
    importDfcLibreOfficeSvpkg: vi.fn(() => Promise.resolve({
      ok: false,
      reason: 'local_package_unavailable',
      message: 'LibreOffice svpkg package could not be read',
    })),
    quarantineDfcLibreOfficeRuntime: vi.fn(() => Promise.resolve({
      ok: false,
      reason: 'not_installed',
      message: 'LibreOffice managed runtime root is not configured',
    })),
  }
  return { runtime: { enginePluginLifecycleService: spies } as any, spies }
}

describe('DbWorker handler registration modules', () => {
  it('register modules fully cover DB_WORKER_METHODS', () => {
    const harness = createHarness()
    registerAllWorkerHandlerModules(harness, {} as any)

    expect(() => {
      assertDbMethodCoverage(
        'DbWorkerRuntime.registerHandlers(modularized)',
        DB_WORKER_METHODS,
        harness.handlers.keys()
      )
    }).not.toThrow()
    expect(harness.handlers.size).toBe(DB_WORKER_METHODS.length)
  })

  it('keeps representative handler routing behavior', () => {
    const harness = createHarness()
    const { runtime, spies } = createRepresentativeRuntime()

    registerProjectHandlers(harness.register, runtime)
    registerUsagePrefsSettingsHandlers(harness.register, runtime)
    expectHandlersPresent(harness.handlers, representativeMethods)
    exerciseRepresentativeHandlers(harness.handlers)

    expect(spies.projectList).toHaveBeenCalledWith({})
    expect(spies.usageAggregate).toHaveBeenCalledWith({})
    expect(spies.modelCatalogQueryScopedActive).toHaveBeenCalledWith(expect.objectContaining({
      providerKey: 'openrouter',
      catalogScopeKey: 'scope-worker-test',
      sortBy: 'name',
    }))
    expect(spies.modelCatalogClearScopedCatalog).toHaveBeenCalledWith('openrouter', 'scope-worker-test')
    expect(spies.modelCatalogClearAllProviderScopedCatalog).toHaveBeenCalledWith('openrouter')
    expect(spies.modelCatalogCleanupExpiredScopedCatalogCaches).toHaveBeenCalledWith('openrouter', 2000, 1000)
    expect(spies.modelCatalogClearDeprecatedOpenRouterCatalogCache).toHaveBeenCalledWith()
    expect(spies.modelPrefsRecordRecent).toHaveBeenCalledWith(expect.objectContaining({ modelKey: 'openrouter::openai/gpt-4o' }))
  })

  it('registers plugin lifecycle methods used by settings panel', async () => {
    const harness = createHarness()
    const { runtime, spies } = createLifecycleRuntime()

    registerEnginePluginLifecycleHandlers(harness.register, runtime)
    expectHandlersPresent(harness.handlers, lifecycleMethods)
    await exerciseLifecycleHandlers(harness.handlers)

    expect(spies.listOfficialPlugins).toHaveBeenCalledWith({ catalogPath: 'catalog.json' })
    expect(spies.getInstalledPlugins).toHaveBeenCalledWith()
    expect(spies.getDiagnosticsSummary).toHaveBeenCalledWith()
    expect(spies.installOfficialPlugin).toHaveBeenCalledWith({
      pluginId: 'magika',
      pluginVersion: '0.1.0',
      enabled: false,
    })
    expect(spies.getInstallOperationStatus).toHaveBeenCalledWith({
      operationId: undefined,
      pluginId: 'magika',
      pluginVersion: '0.1.0',
    })
    expect(spies.registerLocalOfficialPlugin).toHaveBeenCalledWith({
      catalogPath: 'catalog.json',
      pluginId: 'magika',
      pluginVersion: '0.1.0',
      installRootKind: 'managed_root',
      installRef: 'plugin_magika_001',
      enabled: true,
    })
    expect(spies.enablePlugin).toHaveBeenCalledWith({ engineId: 'magika' })
    expect(spies.disablePlugin).toHaveBeenCalledWith({ engineId: 'magika' })
    expect(spies.uninstallPlugin).toHaveBeenCalledWith({ engineId: 'magika' })
    expect(spies.runHealthCheck).toHaveBeenCalledWith({ engineId: 'magika' })
    expect(spies.registerLocalPackage).toHaveBeenCalledWith({
      packageDir: 'package-dir',
      installRootKind: 'test_root',
      installRef: 'plugin_magika_001',
      enabled: true,
    })
    expect(spies.importDfcLibreOfficeSvpkg).toHaveBeenCalledWith({ packagePath: 'runtime.svpkg' })
    expect(spies.quarantineDfcLibreOfficeRuntime).toHaveBeenCalledWith()
  })

  it('keeps install operation status observable while an install handler is pending', async () => {
    const harness = createHarness()
    let resolveLongInstall: (value: unknown) => void = () => undefined
    const longInstall = new Promise((resolve) => {
      resolveLongInstall = resolve
    })
    const runtime = {
      enginePluginLifecycleService: {
        installOfficialPlugin: vi.fn(() => longInstall),
        getInstallOperationStatus: vi.fn(() => ({
          ok: true,
          value: {
            operationId: 'official-install-libreoffice-0.1.0-m49',
            pluginId: 'libreoffice',
            pluginVersion: '0.1.0',
            operationType: 'official_install',
            source: 'official_builtin',
            state: 'downloading',
            phase: 'downloading',
            phaseLabel: 'Downloading',
            progressSummary: 'Downloading',
            stateHistory: ['accepted', 'pending', 'downloading'],
            startedAt: 1,
            updatedAt: 2,
            terminalAt: null,
            failureReason: null,
            diagnosticCode: null,
            sanitizedDiagnostics: [],
            installedEngineId: null,
            result: null,
          },
        })),
      },
    } as any

    registerEnginePluginLifecycleHandlers(harness.register, runtime)
    const installPromise = dispatchWorkerMessage(harness.handlers, {
      id: 'install',
      method: 'enginePluginLifecycle.installOfficialPlugin',
      params: { pluginId: 'libreoffice', pluginVersion: '0.1.0' },
    })

    const pollStartedAt = Date.now()
    const status = await dispatchWorkerMessage(harness.handlers, {
      id: 'status',
      method: 'enginePluginLifecycle.getInstallOperationStatus',
      params: { operationId: 'official-install-libreoffice-0.1.0-m49' },
    })
    expect(Date.now() - pollStartedAt).toBeLessThan(100)
    expect(status).toMatchObject({
      id: 'status',
      ok: true,
      result: {
        ok: true,
        value: {
          pluginId: 'libreoffice',
          state: 'downloading',
          stateHistory: ['accepted', 'pending', 'downloading'],
        },
      },
    })
    expect(runtime.enginePluginLifecycleService.getInstallOperationStatus).toHaveBeenCalledWith({
      operationId: 'official-install-libreoffice-0.1.0-m49',
      pluginId: undefined,
      pluginVersion: undefined,
    })

    resolveLongInstall({
      ok: true,
      value: {
        operationId: 'official-install-libreoffice-0.1.0-m49',
        pluginId: 'libreoffice',
        pluginVersion: '0.1.0',
        state: 'downloading',
      },
    })
    await expect(installPromise).resolves.toMatchObject({ id: 'install', ok: true })
  })
})

const representativeMethods = [
  'project.list',
  'usage.aggregate',
  'modelCatalog.queryScopedActive',
  'modelCatalog.clearScopedCatalog',
  'modelCatalog.clearAllProviderScopedCatalog',
  'modelCatalog.cleanupExpiredScopedCatalogCaches',
  'modelCatalog.clearDeprecatedOpenRouterCatalogCache',
  'modelPrefs.listFavorites',
  'modelPrefs.addFavorite',
  'modelPrefs.removeFavorite',
  'modelPrefs.reorderFavorites',
  'modelPrefs.listRecents',
  'modelPrefs.recordRecent',
] as const satisfies readonly DbMethod[]

const lifecycleMethods = [
  'enginePluginLifecycle.listOfficialPlugins',
  'enginePluginLifecycle.listInstalledPlugins',
  'enginePluginLifecycle.getDiagnosticsSummary',
  'enginePluginLifecycle.registerLocalOfficialPlugin',
  'enginePluginLifecycle.installOfficialPlugin',
  'enginePluginLifecycle.getInstallOperationStatus',
  'enginePluginLifecycle.enablePlugin',
  'enginePluginLifecycle.disablePlugin',
  'enginePluginLifecycle.uninstallPlugin',
  'enginePluginLifecycle.runHealthCheck',
  'enginePluginLifecycle.registerLocalPackage',
  'enginePluginLifecycle.importLibreOfficeSvpkgFromPath',
  'enginePluginLifecycle.quarantineLibreOfficeRuntime',
] as const satisfies readonly DbMethod[]

function exerciseRepresentativeHandlers(handlers: ReadonlyMap<DbMethod, DbHandler>) {
  expect(handlers.get('project.list')!({ includeSystem: true })).toEqual([{ id: 'p1', name: 'default' }])
  expect(handlers.get('usage.aggregate')!({ days: 7 })).toEqual({ total: 0 })
  expect(handlers.get('modelCatalog.queryScopedActive')!({
    providerKey: 'openrouter',
    catalogScopeKey: 'scope-worker-test',
    sortBy: 'name',
  })).toEqual({ items: [], nextCursor: null })
  expect(handlers.get('modelCatalog.clearScopedCatalog')!({
    providerKey: 'openrouter',
    catalogScopeKey: 'scope-worker-test',
  })).toEqual({ deleted: {}, deletedScopeCount: 1 })
  expect(handlers.get('modelCatalog.clearAllProviderScopedCatalog')!({ providerKey: 'openrouter' })).toEqual({ deleted: {}, deletedScopeCount: 2 })
  expect(handlers.get('modelCatalog.cleanupExpiredScopedCatalogCaches')!({
    providerKey: 'openrouter',
    nowMs: 2000,
    retentionMs: 1000,
  })).toEqual({ deleted: {}, deletedScopeCount: 1 })
  expect(handlers.get('modelCatalog.clearDeprecatedOpenRouterCatalogCache')!({})).toEqual({ deleted: {}, deletedScopeCount: 0 })
  expect(handlers.get('modelPrefs.listFavorites')!({ scopeType: 'global', scopeId: '' })).toEqual([])
  expect(handlers.get('modelPrefs.addFavorite')!(modelPrefInput)).toEqual({ modelKey: 'openrouter::openai/gpt-4o', sortRank: 0 })
  expect(handlers.get('modelPrefs.removeFavorite')!(modelPrefInput)).toEqual({ removed: 1 })
  expect(handlers.get('modelPrefs.reorderFavorites')!({ scopeType: 'global', scopeId: '', orderedModelKeys: ['openrouter::openai/gpt-4o'] })).toEqual({ items: [] })
  expect(handlers.get('modelPrefs.listRecents')!({ scopeType: 'global', scopeId: '', limit: 20 })).toEqual([])
  expect(handlers.get('modelPrefs.recordRecent')!(modelPrefInput)).toEqual({ modelKey: 'openrouter::openai/gpt-4o', useCount: 1 })
}

async function exerciseLifecycleHandlers(handlers: ReadonlyMap<DbMethod, DbHandler>) {
  expect(handlers.get('enginePluginLifecycle.listInstalledPlugins')!(undefined)).toEqual([])
  expect(handlers.get('enginePluginLifecycle.getDiagnosticsSummary')!(undefined)).toEqual({
    engines: [],
    counts: { total: 0, installed: 0, enabled: 0, healthy: 0, failed: 0, unverified: 0 },
  })
  await expect(handlers.get('enginePluginLifecycle.listOfficialPlugins')!({ catalogPath: 'catalog.json' })).resolves.toEqual({ ok: true, value: [] })
  await expect(handlers.get('enginePluginLifecycle.installOfficialPlugin')!({
    pluginId: 'magika',
    pluginVersion: '0.1.0',
  })).resolves.toEqual({
    ok: true,
    value: {
      operationId: 'official-install-magika-0.1.0-1',
      pluginId: 'magika',
      pluginVersion: '0.1.0',
      operationType: 'official_install',
      source: 'official_builtin',
      state: 'pending',
      phase: 'pending',
      phaseLabel: 'Preparing install',
      progressSummary: 'Preparing install',
      stateHistory: ['accepted', 'pending'],
      startedAt: 1,
      updatedAt: 1,
      terminalAt: null,
      failureReason: null,
      diagnosticCode: null,
      sanitizedDiagnostics: [],
      installedEngineId: null,
      result: null,
    },
  })
  expect(handlers.get('enginePluginLifecycle.getInstallOperationStatus')!({
    pluginId: 'magika',
    pluginVersion: '0.1.0',
  })).toEqual({
    ok: true,
    value: null,
  })
  await expect(handlers.get('enginePluginLifecycle.registerLocalOfficialPlugin')!({
    catalogPath: 'catalog.json',
    pluginId: 'magika',
    pluginVersion: '0.1.0',
    installRootKind: 'managed_root',
    installRef: 'plugin_magika_001',
  })).resolves.toEqual({
    ok: false,
    reason: 'already_registered',
    message: 'official plugin is already registered',
  })
  await expect(handlers.get('enginePluginLifecycle.enablePlugin')!({ engineId: 'magika' })).resolves.toEqual({
    ok: true,
    value: { engineId: 'magika', enabled: true, installState: 'installed' },
  })
  expect(handlers.get('enginePluginLifecycle.disablePlugin')!({ engineId: 'magika' })).toEqual({
    ok: true,
    value: { engineId: 'magika', enabled: false, installState: 'installed' },
  })
  expect(handlers.get('enginePluginLifecycle.uninstallPlugin')!({ engineId: 'magika' })).toEqual({
    ok: true,
    value: { engineId: 'magika', enabled: false, installState: 'uninstalled' },
  })
  await expect(handlers.get('enginePluginLifecycle.runHealthCheck')!({ engineId: 'magika' })).resolves.toEqual({
    ok: true,
    value: { engineId: 'magika', healthStatus: 'healthy' },
  })
  await expect(handlers.get('enginePluginLifecycle.registerLocalPackage')!({
    packageDir: 'package-dir',
    installRootKind: 'test_root',
    installRef: 'plugin_magika_001',
  })).resolves.toEqual({
    ok: false,
    reason: 'already_registered',
    message: 'plugin is already registered',
  })
  await expect(handlers.get('enginePluginLifecycle.importLibreOfficeSvpkgFromPath')!({
    packagePath: 'runtime.svpkg',
  })).resolves.toEqual({
    ok: false,
    reason: 'local_package_unavailable',
    message: 'LibreOffice svpkg package could not be read',
  })
  await expect(handlers.get('enginePluginLifecycle.quarantineLibreOfficeRuntime')!(undefined)).resolves.toEqual({
    ok: false,
    reason: 'not_installed',
    message: 'LibreOffice managed runtime root is not configured',
  })
}

const modelPrefInput = {
  scopeType: 'global',
  scopeId: '',
  modelKey: 'openrouter::openai/gpt-4o',
}

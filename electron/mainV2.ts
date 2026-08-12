import { app, ipcMain, session } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { checkConfigIntegrity, checkTotalSize, CURRENT_CONFIG_VERSION, migrateConfig, validateAndCleanConfig } from './config/configSchema'
import { RawGenerationRequestStore } from './debug/rawGenerationRequestStore'
import { initMainI18n } from './i18n/mainI18n'
import { createFileSelectionGrantStore } from './ipc/fileSelectionGrants'
import { registerDialogIpc } from './ipc/dialogIpc'
import { registerGenerationV2Ipc } from './ipc/generationV2IpcRegistration'
import { registerGenerationV2ComposerIpc } from './ipc/generationV2ComposerIpc'
import { registerGenerationV2SearchIpc } from './ipc/generationV2SearchIpc'
import { registerEnginePluginLifecycleV2Ipc } from './ipc/enginePluginLifecycleV2Ipc'
import { registerInAppBrowserIpc } from './ipc/inappBrowserIpc'
import { registerRawGenerationDebugIpc } from './ipc/rawGenerationDebugIpc'
import { registerShellIpc } from './ipc/shellIpc'
import { registerStoreIpc } from './ipc/storeIpc'
import { recoverGenerationOrphansV2 } from './services/generationOrphanRecoveryV2'
import { createInAppBrowserManager } from './services/inappBrowser'
import { createEpoch2EnginePluginLifecycleService } from './services/epoch2EnginePluginLifecycleService'
import { createMainProcessElectronConversionService } from './services/electronConversionService'
import { createMainWindowLifecycle } from './windows/mainWindowLifecycle'
import { clearMainWindowActivator, registerMainWindowActivator } from './windows/mainWindowActivation'
import { requireEpoch2ApplicationRuntime } from './bootstrap/epoch2ApplicationRuntime'
import { createProductNetworkProxyV2Controller } from './net/productNetworkProxyV2'
import { createElectronSessionProviderFetch } from './net/providerHttpTransport'
import { registerNetworkProxyIpc } from './ipc/networkProxyIpc'
import { isEpoch2SmokeFixtureAuthorityEnabled, registerEpoch2SmokeFixtureIpc } from './ipc/epoch2SmokeFixtureIpc'
import { bindPackagedTestDocxFixtureGrantInvalidationV1, createPackagedTestDocxFixtureAuthorityV1 } from './ipc/packagedTestDocxFixtureAuthorityV1'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged
process.env.APP_ROOT = path.join(__dirname, '..')
const rendererDist = path.join(process.env.APP_ROOT, 'dist')
const viteDevServerUrl = process.env.VITE_DEV_SERVER_URL
process.env.VITE_PUBLIC = viteDevServerUrl ? path.join(process.env.APP_ROOT, 'public') : rendererDist

export async function startMainV2(): Promise<void> {
  const runtime = requireEpoch2ApplicationRuntime()
  const store = runtime.configStore
  runtime.epoch2.assertCurrent()
  initMainI18n(store, app.getPreferredSystemLanguages())

  function maintainConfig(): void {
  const raw = store.store as Record<string, unknown>
  const version = Number(raw.configVersion ?? 1)
  if (Number.isSafeInteger(version) && version < CURRENT_CONFIG_VERSION) {
    const migrated = migrateConfig(raw)
    for (const [key, value] of Object.entries(migrated)) store.set(key, value)
  }
  const { removed } = validateAndCleanConfig(store.store as Record<string, unknown>)
  for (const item of removed) store.delete(item.key)
  if (!store.has('configVersion')) store.set('configVersion', CURRENT_CONFIG_VERSION)
}

  function inspectConfigSize(context: 'startup' | 'write'): void {
  const result = checkTotalSize(store.store as Record<string, unknown>)
  if (result.level !== 'ok') {
    console.warn('[config-v2] configuration size requires attention', { context, level: result.level, size: result.size })
  }
}

  maintainConfig()
  inspectConfigSize('startup')
  const integrity = checkConfigIntegrity(store)
  if (!integrity.ok) throw new Error('EPOCH2_CONFIG_INTEGRITY_INVALID')

  const rawGenerationRequestStore = new RawGenerationRequestStore(
  path.join(runtime.layout.debugRoot, 'generation-raw.sqlite'),
)
  const registerInvoke = (channel: string, handler: (...args: any[]) => unknown) => {
  ipcMain.handle(channel, handler)
}
  const inAppBrowserManager = createInAppBrowserManager()
  const fileSelectionGrants = createFileSelectionGrantStore()
  const packagedTestDocxFixtureAuthority = await createPackagedTestDocxFixtureAuthorityV1({
  isPackaged: app.isPackaged,
  env: process.env,
  argv: process.argv,
  userDataRoot: app.getPath('userData'),
  tempRoot: runtime.layout.tempRoot,
  repositoryRoot: process.cwd(),
  registerInvoke,
  fileSelectionGrants,
})
  const networkProxyController = createProductNetworkProxyV2Controller({
  store,
  session: session.defaultSession,
  env: () => process.env,
})
  const startupProxyResult = await networkProxyController.applyStoredSettings()
  if (!startupProxyResult.ok) {
    console.warn('[proxy-v2] governed network requests are blocked', { code: startupProxyResult.code })
  }
  const localDirectSession = session.fromPartition('starverse-local-direct-v2')
  await localDirectSession.setProxy({ mode: 'direct' })
  await localDirectSession.forceReloadProxyConfig()
  await localDirectSession.closeAllConnections()
  const cloudFetch = createElectronSessionProviderFetch({
  session: session.defaultSession,
  beforeRequest: () => networkProxyController.assertGovernedRequestAvailable(),
})
  const localDirectFetch = createElectronSessionProviderFetch({ session: localDirectSession })
  const electronConversionBridge = createMainProcessElectronConversionService({ providerFetch: cloudFetch,
    beforeGovernedRequest: () => networkProxyController.assertGovernedRequestAvailable() })
  const enginePluginLifecycle = createEpoch2EnginePluginLifecycleService({
  db: runtime.epoch2.database,
  layout: runtime.layout,
  configStore: store,
  isProduction: app.isPackaged,
  providerFetch: cloudFetch,
  beforeGovernedRequest: () => networkProxyController.assertGovernedRequestAvailable(),
  electronConversionBridge,
})

  recoverGenerationOrphansV2(runtime.epoch2.database)
  registerGenerationV2Ipc({ registerInvoke, epoch2: runtime.epoch2, rawGenerationRequestStore,
  cloudFetch, localDirectFetch, proxyMode: () => networkProxyController.getState().settings.proxyMode })
  registerNetworkProxyIpc({ registerInvoke, controller: networkProxyController })
  registerGenerationV2ComposerIpc({ registerInvoke, db: runtime.epoch2.database,
  attachmentBlobStore: runtime.epoch2.attachmentBlobStore, fileSelectionGrants, cloudFetch,
  electronConversionBridge, tempRoot: runtime.layout.tempRoot, runtimesRoot: runtime.layout.runtimesRoot })
  registerEpoch2SmokeFixtureIpc({
  enabled: isEpoch2SmokeFixtureAuthorityEnabled({ isPackaged: app.isPackaged, env: process.env, argv: process.argv }),
  fixtureRoot: process.env.SV_EPOCH2_SMOKE_FIXTURE_ROOT ?? null,
  registerInvoke,
  fileSelectionGrants,
})
  registerGenerationV2SearchIpc({ registerInvoke, db: runtime.epoch2.database })
  registerEnginePluginLifecycleV2Ipc({ registerInvoke, lifecycle: enginePluginLifecycle })
  registerRawGenerationDebugIpc({ registerInvoke, store: rawGenerationRequestStore })
  registerStoreIpc({
  registerInvoke,
  store,
  isDev,
  migrateAndCleanupConfig: maintainConfig,
  performConfigSizeCheck: inspectConfigSize,
  refreshMainLocale: () => initMainI18n(store, app.getPreferredSystemLanguages()),
})
  registerDialogIpc({
  registerInvoke,
  fileSelectionGrants,
  importLibreOfficeSvpkg: (packagePath) => enginePluginLifecycle.importDfcLibreOfficeSvpkg({ packagePath }),
  quarantineLibreOfficeRuntime: () => enginePluginLifecycle.quarantineDfcLibreOfficeRuntime(),
})
  registerShellIpc({ registerInvoke })
  registerInAppBrowserIpc({ registerInvoke, manager: inAppBrowserManager })

  const mainWindowLifecycle = createMainWindowLifecycle({
  isDev,
  viteDevServerUrl,
  rendererDist,
  publicPath: process.env.VITE_PUBLIC ?? rendererDist,
  preloadPath: path.join(__dirname, 'preload.mjs'),
  onMainProcessMessage: (window) => window.webContents.send('main-process-message', new Date().toLocaleString()),
})
  mainWindowLifecycle.registerAppLifecycleHandlers()
  mainWindowLifecycle.createWindow()
  registerMainWindowActivator(() => mainWindowLifecycle.focusWindow())
  packagedTestDocxFixtureAuthority?.register(() => mainWindowLifecycle.getWindow()?.webContents.id ?? null)
  const packagedFixtureWindow = mainWindowLifecycle.getWindow()
  if (packagedTestDocxFixtureAuthority && packagedFixtureWindow) {
    bindPackagedTestDocxFixtureGrantInvalidationV1({ window: packagedFixtureWindow, fileSelectionGrants })
  }

  let closing = false
  app.on('before-quit', (event) => {
  if (closing) return
  event.preventDefault()
  closing = true
  mainWindowLifecycle.clearWindowListeners()
  clearMainWindowActivator()
  void (async () => {
    rawGenerationRequestStore.close()
    await packagedTestDocxFixtureAuthority?.dispose()
    await runtime.epoch2.close()
    app.exit(0)
  })().catch(() => {
    console.error('[main-v2] MAIN_V2_SHUTDOWN_FAILED')
    app.exit(1)
  })
  })
}

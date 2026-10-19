import { app, BrowserWindow, dialog, ipcMain, session } from 'electron'
import { normalizeProjectDuplicatePolicy } from '../src/shared/settings/projectDuplicatePolicy'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { checkConfigIntegrity, checkTotalSize, CURRENT_CONFIG_VERSION, migrateConfig, validateAndCleanConfig } from './config/configSchema'
import { createAppShutdownCoordinatorV2, createStoreBackedQuitWarningSourceV2 } from './services/appShutdownCoordinatorV2'
import { RawGenerationRequestStore } from './debug/rawGenerationRequestStore'
import { initMainI18n, t } from './i18n/mainI18n'
import { createFileSelectionGrantStore } from './ipc/fileSelectionGrants'
import { randomUUID } from 'node:crypto'
import { createNetworkProxyDraftProbe } from './net/networkProxyDraftProbe'
import { applySessionRequestPolicy } from './net/sessionRequestPolicy'
import { registerDialogIpc } from './ipc/dialogIpc'
import { createStoreBackedGenerationTotalTimeoutSourceV2, setGenerationTotalTimeoutSourceV2 } from './services/generationTimeoutPolicyV2'
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
import { isTrustedProxyIpcSender, registerNetworkProxyIpc } from './ipc/networkProxyIpc'
import { isEpoch2SmokeFixtureAuthorityEnabled, registerEpoch2SmokeFixtureIpc } from './ipc/epoch2SmokeFixtureIpc'
import { bindPackagedTestDocxFixtureGrantInvalidationV1, createPackagedTestDocxFixtureAuthorityV1 } from './ipc/packagedTestDocxFixtureAuthorityV1'
import { createMagikaUtilityProcessRunner } from './services/magikaUtilityProcessRunner'
import { Epoch2FileTypeDetectionService, GENERATION_V2_FILE_TYPE_DETECTION_UPDATED_CHANNEL } from './services/epoch2FileTypeDetectionService'
import { ModelsDevOfficialSourceRefreshV1 } from './services/modelsDevOfficialSourceRefreshV1'
import { CloudRulesCandidateRefreshV1 } from './services/cloudRulesCandidateRefreshV1'
import { CloudRulesApplicationV1Service } from './services/cloudRulesApplicationV1Service'
import { registerGenerationV2CloudCapabilityRulesIpc } from './ipc/generationV2CloudCapabilityRulesIpc'
import { AuthoritativeModelSubjectSetV1Service } from
  '../infra/db/services/authoritativeModelSubjectSetV1Service'
import { CloudRulesApplicationV1Repo } from '../infra/db/repo/cloudRulesApplicationV1Repo'
import { CloudRulesDistributionV1Repo } from '../infra/db/repo/cloudRulesDistributionV1Repo'
import { GENERATION_V2_MODEL_FACTS_SEMANTIC_INVALIDATED,
  type ModelFactsSemanticInvalidationV1 } from '../src/core/generation-v2/model-facts/semanticInvalidationV1'
import { applyBootstrapCapabilityRulesWithInvalidationV1 } from './services/modelFactsSemanticInvalidationV1'
import { applyAgentSessionNetworkPolicy, assertAgentNetworkAccess, getAgentAutomationOptions } from './bootstrap/agentAutomationRuntime'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged
process.env.APP_ROOT = path.join(__dirname, '..')
const rendererDist = path.join(process.env.APP_ROOT, 'dist')
const viteDevServerUrl = process.env.VITE_DEV_SERVER_URL
process.env.VITE_PUBLIC = viteDevServerUrl ? path.join(process.env.APP_ROOT, 'public') : rendererDist

export async function startMainV2(): Promise<void> {
  const agentAutomation = getAgentAutomationOptions()
  applyAgentSessionNetworkPolicy(session.defaultSession)
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
  const notifyModelFactsSemanticInvalidated = (event: ModelFactsSemanticInvalidationV1) => {
    for (const window of BrowserWindow.getAllWindows()) {
      try {
        if (!window.isDestroyed() && !window.webContents.isDestroyed()) {
          window.webContents.send(GENERATION_V2_MODEL_FACTS_SEMANTIC_INVALIDATED, event)
        }
      } catch { console.warn('[model-facts-v1] semantic invalidation delivery failed', { code: 'DELIVERY_FAILED' }) }
    }
  }
  const shutdownCoordinator = createAppShutdownCoordinatorV2({
    isWarningEnabled: createStoreBackedQuitWarningSourceV2(store),
    confirmQuit: async () => {
      const options = {
        type: 'warning' as const,
        title: t('dialogs.quitWithActiveWork.title'),
        message: t('dialogs.quitWithActiveWork.message'),
        detail: t('dialogs.quitWithActiveWork.detail'),
        buttons: [t('dialogs.quitWithActiveWork.quit'), t('dialogs.quitWithActiveWork.cancel')],
        defaultId: 1,
        cancelId: 1,
        noLink: true,
      }
      const parent = BrowserWindow.getAllWindows().find((window) => !window.isDestroyed())
      const result = parent ? await dialog.showMessageBox(parent, options) : await dialog.showMessageBox(options)
      return result.response === 0
    },
    closeResources: async () => {
      rawGenerationRequestStore.close()
      await packagedTestDocxFixtureAuthority?.dispose()
      await cloudRulesCandidateRefresh.dispose()
      await modelsDevSourceRefresh.dispose()
      await runtime.epoch2.close()
    },
    exit: (code) => app.exit(code),
    onShutdownStarted: () => {
      mainWindowLifecycle.clearWindowListeners()
      clearMainWindowActivator()
    },
    onQuitCancelled: () => {
      // On Windows/Linux the window may already be closed (that is what triggered the quit).
      if (!mainWindowLifecycle.focusWindow()) mainWindowLifecycle.createWindow()
    },
  })
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
  const browserSession = session.fromPartition('persist:intra-links')
  const networkProxyController = createProductNetworkProxyV2Controller({
  store,
  session: session.defaultSession,
  browserSession,
  env: () => process.env,
})
  applySessionRequestPolicy(browserSession, (rawUrl) => {
    const url = new URL(rawUrl)
    if (url.protocol === 'ws:') url.protocol = 'http:'
    if (url.protocol === 'wss:') url.protocol = 'https:'
    assertAgentNetworkAccess(url.toString())
    return networkProxyController.getState('browser').status === 'ready'
  })
  const startupProxyResult = await networkProxyController.applyStoredSettings()
  if (!startupProxyResult.ok) {
    console.warn('[proxy-v2] some network scopes are blocked', {
      application: networkProxyController.getState().errorCode, browser: networkProxyController.getState('browser').errorCode })
  }
  const inAppBrowserManager = createInAppBrowserManager({ session: browserSession,
    assertNetworkReady: () => networkProxyController.assertGovernedRequestAvailable('browser') })
  const proxyDraftProbe = createNetworkProxyDraftProbe({
    createSession: () => {
      const target = session.fromPartition(`starverse-proxy-probe-${randomUUID()}`, { cache: false })
      applyAgentSessionNetworkPolicy(target)
      return target
    },
    beforeRequest: assertAgentNetworkAccess,
  })
  const localDirectSession = session.fromPartition('starverse-local-direct-v2')
  applyAgentSessionNetworkPolicy(localDirectSession)
  await localDirectSession.setProxy({ mode: 'direct' })
  await localDirectSession.forceReloadProxyConfig()
  await localDirectSession.closeAllConnections()
  const cloudFetch = createElectronSessionProviderFetch({
  session: session.defaultSession,
  beforeRequest: (url) => {
    assertAgentNetworkAccess(url)
    networkProxyController.assertGovernedRequestAvailable()
  },
})
  const localDirectFetch = createElectronSessionProviderFetch({ session: localDirectSession,
    beforeRequest: assertAgentNetworkAccess })
  const modelsDevSourceRefresh = new ModelsDevOfficialSourceRefreshV1({
  db: runtime.epoch2.database,
  fetchImpl: cloudFetch,
})
  void modelsDevSourceRefresh.start().then((result) => {
    if (!result.ok) console.warn('[models-dev-source-v1] refresh failed', { code: result.code })
  }).catch(() => console.warn('[models-dev-source-v1] refresh failed', { code: 'UNEXPECTED_REFRESH_FAILURE' }))
  const cloudRulesCandidateRefresh = new CloudRulesCandidateRefreshV1({
  db: runtime.epoch2.database,
  fetchImpl: cloudFetch,
  onDiagnostic: (diagnostic) => console.warn('[cloud-rules-candidate-v1] diagnostic', diagnostic),
  afterSuccessfulCheck: async () => {
    const result = await applyBootstrapCapabilityRulesWithInvalidationV1({
      applyBootstrapCandidate: () => cloudRulesApplication.applyBootstrapCandidate(),
      notify: notifyModelFactsSemanticInvalidated,
    })
    if (result) console.info('[cloud-rules-application-v1] bootstrap applied')
  },
  })
  const cloudRulesSubjectSet = new AuthoritativeModelSubjectSetV1Service(
  runtime.epoch2.database,
  runtime.epoch2.credentialService,
  runtime.epoch2.openAICompatibleCredentialService,
  )
  const cloudRulesApplication = new CloudRulesApplicationV1Service(
  runtime.epoch2.database,
  cloudRulesSubjectSet,
  )
  // This synchronous health gate runs before Generation IPC registration, so a corrupt
  // applied LKG cannot remain readable while the asynchronous network check is pending.
  cloudRulesApplication.ensureCurrentLkgHealth()
  void cloudRulesCandidateRefresh.start().then((result) => {
    if (!result.ok) console.warn('[cloud-rules-candidate-v1] refresh failed', { code: result.code })
  }).catch(() => console.warn('[cloud-rules-candidate-v1] refresh failed', { code: 'UNEXPECTED_REFRESH_FAILURE' }))
  const electronConversionBridge = createMainProcessElectronConversionService({ providerFetch: cloudFetch,
    beforeGovernedRequest: () => networkProxyController.assertGovernedRequestAvailable() })
  const magikaProcessRunner = createMagikaUtilityProcessRunner()
  shutdownCoordinator.registerSource({ name: 'electron-conversion', activeCount: () => electronConversionBridge.activeCount(),
    quiesce: () => electronConversionBridge.quiesceForShutdown() })
  const enginePluginLifecycle = createEpoch2EnginePluginLifecycleService({
  db: runtime.epoch2.database,
  layout: runtime.layout,
  configStore: store,
  isProduction: app.isPackaged,
  providerFetch: cloudFetch,
  beforeGovernedRequest: () => networkProxyController.assertGovernedRequestAvailable(),
  electronConversionBridge,
  magikaProcessRunner,
})
  const fileTypeDetectionService = new Epoch2FileTypeDetectionService({
  db: runtime.epoch2.database,
  attachmentBlobStore: runtime.epoch2.attachmentBlobStore,
  layout: runtime.layout,
  magikaProcessRunner,
  notify: (event) => {
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed()) window.webContents.send(GENERATION_V2_FILE_TYPE_DETECTION_UPDATED_CHANNEL, event)
    }
  },
})
  shutdownCoordinator.registerSource({ name: 'file-type-detection', activeCount: () => fileTypeDetectionService.activeCount(),
    quiesce: () => fileTypeDetectionService.quiesceForShutdown() })

  const orphanRecovery = recoverGenerationOrphansV2(runtime.epoch2.database)
  if (orphanRecovery.unrecoveredOperationIds.length > 0) {
    console.error('[generation-recovery] GENERATION_V2_ORPHAN_RECOVERY_STATE_INVALID',
      { count: orphanRecovery.unrecoveredOperationIds.length })
  }
  setGenerationTotalTimeoutSourceV2(createStoreBackedGenerationTotalTimeoutSourceV2(store))
  registerGenerationV2Ipc({ registerInvoke, epoch2: runtime.epoch2, rawGenerationRequestStore,
  getProjectDuplicatePolicy: () => normalizeProjectDuplicatePolicy(store.get('generationV2UiPreferences.projectDuplicatePolicy')),
  cloudFetch, localDirectFetch, proxyMode: () => networkProxyController.getState().settings.proxyMode,
  notifyModelFactsSemanticInvalidated, registerActiveWorkSource: shutdownCoordinator.registerSource })
  registerGenerationV2CloudCapabilityRulesIpc({ registerInvoke, refresh: cloudRulesCandidateRefresh,
    application: cloudRulesApplication,
    applicationRepo: new CloudRulesApplicationV1Repo(runtime.epoch2.database),
    distributionRepo: new CloudRulesDistributionV1Repo(runtime.epoch2.database), notifyModelFactsSemanticInvalidated })
  registerNetworkProxyIpc({ registerInvoke, controller: networkProxyController, probe: proxyDraftProbe,
    onApplicationReady: () => { void cloudRulesCandidateRefresh.networkRecovered().catch(() => undefined) },
    authorize: (event) => isTrustedProxyIpcSender(event, mainWindowLifecycle.getWindow()?.webContents ?? null) })
  registerGenerationV2ComposerIpc({ registerInvoke, db: runtime.epoch2.database,
  attachmentBlobStore: runtime.epoch2.attachmentBlobStore, fileSelectionGrants, cloudFetch,
  electronConversionBridge, tempRoot: runtime.layout.tempRoot, runtimesRoot: runtime.layout.runtimesRoot,
  fileTypeDetectionService })
  fileTypeDetectionService.recoverPending()
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
  agentBackground: agentAutomation?.hidden,
  agentControlled: agentAutomation !== null,
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

  app.on('before-quit', (event) => shutdownCoordinator.handleBeforeQuit(event))
}
